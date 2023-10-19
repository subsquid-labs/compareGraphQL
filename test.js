import { queryEndpoint, getEndpointSchema } from './graphql.js'
import { getSquidEntities, getSubgraphEntities, getEntitiesFields } from './entities.js'
import { isScalar } from './types.js'

function parseSchema(schema, apiFormat) {
	let entities, nonEntityQueries
	if (apiFormat === 'squid') {
		({ entities, nonEntityQueries } = getSquidEntities(schema))
	}
	else if (apiFormat === 'subgraph') {
		({ entities, nonEntityQueries } = getSubgraphEntities(schema))
	}
	else {
		throw new Error(`parseSchema(): Unknown API format ${apiFormat}`)
	}

	const entitiesFields = getEntitiesFields(entities, schema, {ignoreNonNulls: true})
	return {
		entities: entitiesFields,
		nonEntityQueries
	}
}

function compareStrayQueries(subgraphStrayQueries, squidStrayQueries) {
	const subgraphsq = subgraphStrayQueries.filter(q => q!=='_meta')
	const squidsq = squidStrayQueries.filter(q => q!=='squidStatus')
	if (subgraphsq.length>0 || squidsq.length>0) {
		console.log(`Found queries not related to any entities:\n  squid: ${JSON.stringify(squidsq)}\n  subgraph: ${JSON.stringify(subgraphsq)}`)
	}
}

function compareEntities(subgraphEntities, squidEntities, options = {printComparison: true}) {
	/*
	 * Options fields:
	 *   printComparison (default true)
	 */
	const safeEntities = []
	for (let [ename, efields] of subgraphEntities) {
		const entityIssues = []
		let entityNotFound = false

		const squidEFields = squidEntities.get(ename)
		if (!squidEFields) {
//			console.log(`Subgraph entity "${ename}" not found in the squid`)
			entityIssues.push(`entity not found in the squid`)
			entityNotFound = true
		}
		else {
			if (efields.length!==squidEFields.length) {
				entityIssues.push(`number of entity fields is different`)
			}
			for (const [i, f] of efields.entries()) {
				let squidField = squidEFields[i]
				let msg = []
				if (!squidField) {
					msg.push('field not found')
				}
				else {
					if (f.name!==squidField.name) {
						msg.push(`name diff "${f.name}"!=="${squidField.name}"`)
					}
					if (f.type!==squidField.type && !(f.name==='id' && squidField.name==='id' && f.type==='ID' && squidField.type==='String')) {
						msg.push(`type diff "${f.type}"!=="${squidField.type}"`)
					}
				}
				if (msg.length>0) {
					entityIssues.push(`for field "${f.name}": ${msg.join(', ')}`)
				}
			}
		}

		if (options.printComparison && entityIssues.length>0) {
			console.log(`Issues with entity "${ename}":`)
			for (let iss of entityIssues) {
				console.log(`  ${iss}`)
			}
			if (!entityNotFound) {
				console.log(`Entity fields:\n  in subgraph : ${efields.map(f => f.name)}\n  in squid    : ${squidEFields && squidEFields.map(f => f.name)}`)
			}
			console.log('')
		}
		else {
			safeEntities.push(ename)
		}
	}
	return new Set(safeEntities)
}

function sortEntitiesByTemporalHeuristic(entities, heuristic) {
	/*
	 * heuristic must be a list
	 */
	const temporalEntities = new Map()
	const nonTemporalEntities = new Map()
	for (let [ename, efields] of entities) {
		if (efields.map(f => f.name).filter(fn => heuristic.includes(fn)).length > 0) {
			temporalEntities.set(ename, efields)
		}
		else {
			nonTemporalEntities.set(ename, efields)
		}
	}
	return { temporalEntities, nonTemporalEntities }
}

const subgraphEndpointUrl = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens'
const squidEndpointUrl = 'https://squid.subsquid.io/yat1ma30-ens-abernatskiy-test/v/v1/graphql'

const { entities: subgraphEntities, nonEntityQueries: subgraphStrayQueries } =
	parseSchema(getEndpointSchema(subgraphEndpointUrl), 'subgraph')
const { entities: squidEntities, nonEntityQueries: squidStrayQueries } =
	parseSchema(getEndpointSchema(squidEndpointUrl), 'squid')

// compareStrayQueries(subgraphStrayQueries, squidStrayQueries)
const safeEntitiesNames = compareEntities(subgraphEntities, squidEntities, {printComparison: false})

const safeEntities = new Map([...subgraphEntities.entries()].filter(e => safeEntitiesNames.has(e[0])))

const temporalFields = ['block', 'blockNumber', 'timestamp']
const { temporalEntities, nonTemporalEntities } = sortEntitiesByTemporalHeuristic(safeEntities, temporalFields)

const numRecords = 5
for (let [ename, efields] of temporalEntities) {
	const queryFields = ['id'].concat(efields.filter(f => isScalar(f.type)).map(f => f.name))
	const orderByField = queryFields.find(f => temporalFields.includes(f))
	const subgraphQuery = `{ ${ename}s(first: ${numRecords}, orderBy: ${orderByField}, orderDirection: asc) { ${queryFields.join(' ')} } }`
	const squidQuery = `{ ${ename}s(limit: ${numRecords}, orderBy: ${orderByField}_ASC) { ${queryFields.join(' ')} } }`
	const subgraphResponse = queryEndpoint(subgraphEndpointUrl, subgraphQuery).data[`${ename}s`]
	const squidResponse = queryEndpoint(squidEndpointUrl, squidQuery).data[`${ename}s`]

	const issues = []
	for (let [i, rec] of subgraphResponse.entries()) {
		for (let f of queryFields) {
			if (rec[f]!=squidResponse[i][f]) {
				issues.push(`for record ${i} field ${f} differs: "${rec[f]}" vs "${squidResponse[i][f]}"`)
			}
		}
	}

	if (issues.length>0) {
		console.log(`Issues with entity ${ename} on queries:\nsubgraph query : ${subgraphQuery}\nsquid query    : ${squidQuery}`)
		for (let iss of issues) {
			console.log(`  ${iss}`)
		}
	}
}
