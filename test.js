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
		return {
			humanReadableComparison: `Found queries not related to any entities:\n  squid: ${JSON.stringify(squidsq)}\n  subgraph: ${JSON.stringify(subgraphsq)}`
		}
	}
	return { humanReadableComparison: null }
}

function compareEntities(subgraphEntities, squidEntities) {
	let allIssues = []
	const safeEntities = []
	for (let [ename, efields] of subgraphEntities) {
		const entityIssues = []
		let entityNotFound = false

		const squidEName = [...squidEntities.keys()].find(k => k.toLowerCase()===ename.toLowerCase())
		let squidEFields
		if (!squidEName) {
//			console.log(`Subgraph entity "${ename}" not found in the squid`)
			entityIssues.push(`entity not found in the squid`)
			entityNotFound = true
		}
		else {
			squidEFields = squidEntities.get(squidEName)
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

		if (entityIssues.length>0) {
			let entityIssuesDescription = `Issues with entity "${ename}":\n${entityIssues.join('\n  ')}`
			if (!entityNotFound) {
				entityIssuesDescription += `Entity fields:\n  in subgraph : ${efields.map(f => f.name)}\n  in squid    : ${squidEFields && squidEFields.map(f => f.name)}`
			}
			allIssues.push(entityIssuesDescription)
		}
		else {
			safeEntities.push(ename)
		}
	}
	return {
		humanReadableIssuesDescription: allIssues.length>0 ? allIssues.join('\n\n') : null,
		safeEntities: new Set(safeEntities)
	}
}

function separateEntitiesByTemporalFields(entities, options = {}) {
	/**
	 * Options fields:
	 *   temporalFields - an array of field names to consider temporal, default ['block', 'blockNumber', 'timestamp']
	 */
	const temporalFields = options.temporalFields ?? ['block', 'blockNumber', 'timestamp']
	const temporalEntities = new Map()
	const nonTemporalEntities = new Map()
	for (let [ename, efields] of entities) {
		if (efields.map(f => f.name).filter(fn => temporalFields.includes(fn)).length > 0) {
			temporalEntities.set(ename, efields)
		}
		else {
			nonTemporalEntities.set(ename, efields)
		}
	}
	return { temporalEntities, nonTemporalEntities }
}

function testTemporalEntitiesOnAscendingRecords(
	temporalSubgraphEntities,
	squidEntities,
	subgraphEndpointUrl,
	squidEndpointUrl,
	options = {}
) {
	/**
	 * Options fields:
	 *   numRecords - the number of records to compare, default 10
	 *   ignoreIds - if true, contents of the id field will be ignored unless it is the only field, default false
	 *   temporalFields - an array of field names to consider temporal, default ['block', 'blockNumber', 'timestamp']
	 */
	const ignoreIds = !!options.ignoreIds
	const numRecords = options.numRecords ?? 10
	const temporalFields = options.temporalFields ?? ['block', 'blockNumber', 'timestamp']

	const allIssues = []
	for (let [ename, efields] of temporalSubgraphEntities) {

		const queryFields = ['id'].concat(efields.filter(f => isScalar(f.type)).map(f => f.name))
		if (ignoreIds && queryFields.length<2) {
			console.log(`testTemporalEntitiesOnAscendingRecords(): WARNING - id is the only field for entity ${ename}, cannot ignore it`)
			ignoreIds = false
		}
		const orderByField = queryFields.find(f => temporalFields.includes(f))

		const subgraphQuery = `{ ${ename}s(first: ${numRecords}, orderBy: ${orderByField}, orderDirection: asc) { ${queryFields.join(' ')} } }`

		const capitalizedSquidEntityName = [...squidEntities.keys()].find(k => k.toLowerCase()==ename.toLowerCase())
		const squidQuery = `{ ${capitalizedSquidEntityName}s(limit: ${numRecords}, orderBy: ${orderByField}_ASC) { ${queryFields.join(' ')} } }`

		const subgraphResponse = queryEndpoint(subgraphEndpointUrl, subgraphQuery).data[`${ename}s`]
		const squidResponse = queryEndpoint(squidEndpointUrl, squidQuery).data[`${capitalizedSquidEntityName}s`]

		const issues = []
		for (let [i, rec] of subgraphResponse.entries()) {
			for (let f of queryFields) {
				if (f==='id' && ignoreIds) {
					continue
				}
				if (rec[f]!=squidResponse[i][f]) {
					issues.push(`for record ${i} field ${f} differs: "${rec[f]}" vs "${squidResponse[i][f]}"`)
				}
			}
		}

		if (issues.length>0) {
			allIssues.push(`Issues with entity ${ename} on queries:\nsubgraph query : ${subgraphQuery}\nsquid query    : ${squidQuery}\n${issues.join('\n  ')}`)
		}
	}
	return {
		humanReadableIssuesDescription: allIssues.length>0 ? allIssues.join('\n') : null
	}
}

function testNonTemporalEntitiesOnCrossInclusion(
	nonTemporalSubgraphEntities,
	squidEntities,
	subgraphEndpointUrl,
	squidEndpointUrl,
	options = {}
) {
	/**
	 * Options fields:
	 *   numRecords - the number of records to compare
	 */
	const numRecords = options.numRecords ?? 10

	function checkRecordsInclusion(entityName, queryFields, issues, direction) {
		const squidEntityName = [...squidEntities.keys()].find(k => k.toLowerCase()==entityName.toLowerCase())
		let someRecordsQuery =
			direction==='subgraphToSquid' ?
			`{ ${entityName}s(first: ${numRecords}) { ${queryFields.join(' ')} } }` :
			`{ ${squidEntityName}s(limit: ${numRecords}) { ${queryFields.join(' ')} } }`
		const someRecords =
			direction==='subgraphToSquid' ?
				queryEndpoint(subgraphEndpointUrl, someRecordsQuery).data[`${entityName}s`] :
				queryEndpoint(squidEndpointUrl, someRecordsQuery).data[`${squidEntityName}s`]
		if (someRecords===0) {
			issues.push(`subgraph did not return any records (requested ${numRecords})`)
			return
		}

		const inclusionQuery =
			direction==='subgraphToSquid' ?
			`{ ${squidEntityName}s(where: {id_in: [${someRecords.map(r => `"${r.id}"`).join(', ')}]}) { ${queryFields.join(' ')} } }` :
			`{ ${entityName}s(where: {id_in: [${someRecords.map(r => `"${r.id}"`).join(', ')}]}) { ${queryFields.join(' ')} } }`
		const includedRecords =
			direction==='subgraphToSquid' ?
			queryEndpoint(squidEndpointUrl, inclusionQuery).data[`${squidEntityName}s`] :
			queryEndpoint(subgraphEndpointUrl, inclusionQuery).data[`${squidEntityName}s`]

		const sampleSource = direction==='subgraphToSquid' ? 'subgraph' : 'squid'
		const testDestination = direction==='subgraphToSquid' ? 'squid' : 'subgraph'
		if (someRecords.length!==includedRecords.length) {
			issues.push(`number of same id records found in ${testDestination} (${includedRecords.length}) is different from the size of the sample retrieved from ${sampleSource} (${someRecords.length})`)
		}
		const includedRecordsMap = new Map(includedRecords.map(r => [r.id, r]))
		for (let rec of someRecords) {
			const destRec = includedRecordsMap.get(rec.id)
			if (!destRec) {
				issues.push(`record "${rec.id}" was not found by the ${testDestination}`)
			}
			else {
				for (let f of queryFields) {
					if (rec[f]!=destRec[f]) {
						issues.push(`field ${f} from ${sampleSource} differs in record "${rec.id}": "${rec[f]}" vs "${destRec[f]}"`)
					}
				}
			}
		}
	}

	const allIssues = []
	for (let [ename, efields] of nonTemporalSubgraphEntities) {
		const queryFields = ['id'].concat(efields.filter(f => isScalar(f.type)).map(f => f.name))

		const issues = []
		checkRecordsInclusion(ename, queryFields, issues, 'subgraphToSquid')
		checkRecordsInclusion(ename, queryFields, issues, 'squidToSubgraph')

		if (issues.length>0) {
			allIssues.push(`Issues with entity ${ename}:\n${issues.join('\n  ')}`)
		}
	}
	let humanReadableIssuesDescription = null
	if (allIssues.length>0) {
		humanReadableIssuesDescription = allIssues.join('\n\n')
	}
	return { humanReadableIssuesDescription }
}

const subgraphEndpointUrl = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens'
const squidEndpointUrl = 'https://squid.subsquid.io/yat1ma30-ens-abernatskiy-test/v/v1/graphql'

const { entities: subgraphEntities, nonEntityQueries: subgraphStrayQueries } =
	parseSchema(getEndpointSchema(subgraphEndpointUrl), 'subgraph')
const { entities: squidEntities, nonEntityQueries: squidStrayQueries } =
	parseSchema(getEndpointSchema(squidEndpointUrl), 'squid')

const {
	humanReadableComparison: strayQueriesComparison
} = compareStrayQueries(subgraphStrayQueries, squidStrayQueries)
if (strayQueriesComparison)
	console.log(`${strayQueriesComparison}\n\n---------------------\n`)
else
	console.log('Did not find any queries not associated with entities')

const {
	humanReadableIssuesDescription: schemaIssues,
	safeEntities: safeEntitiesNames
} = compareEntities(subgraphEntities, squidEntities)
if (schemaIssues)
	console.log(`${schemaIssues}\n\n---------------------\n`)
else
	console.log('No issues found during the schema comparison')

const safeSubgraphEntities = new Map([...subgraphEntities.entries()].filter(e => safeEntitiesNames.has(e[0])))

const {
	temporalEntities: temporalSubgraphEntities,
	nonTemporalEntities: nonTemporalSubgraphEntities
} = separateEntitiesByTemporalFields(safeSubgraphEntities)

const {
	humanReadableIssuesDescription: temporalEntitiesIssues
} = testTemporalEntitiesOnAscendingRecords(
	temporalSubgraphEntities,
	squidEntities,
	subgraphEndpointUrl,
	squidEndpointUrl,
	{ignoreIds: true, numRecords: 10}
)
if (temporalEntitiesIssues)
	console.log(`${temporalEntitiesIssues}\n\n---------------------\n`)
else
	console.log('No issues found with temporal entities')

const {
	humanReadableIssuesDescription: nonTemporalEntitiesIssues
} = testNonTemporalEntitiesOnCrossInclusion(
	nonTemporalSubgraphEntities,
	squidEntities,
	subgraphEndpointUrl,
	squidEndpointUrl,
	{numRecords: 10}
)
if (nonTemporalEntitiesIssues)
	console.log(`${temporalEntitiesIssues}\n\n---------------------\n`)
else
	console.log('No issues found with non-temporal entities')
