import { queryEndpoint, getEndpointSchema } from './graphql.js'
import { getSquidEntities, getSubgraphEntities, getEntitiesFields } from './entities.js'

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

function compareEntities(subgraphEntities, squidEntities) {
	for (let [ename, efields] of subgraphEntities) {
		const entityIssues = []

		const squidEFields = squidEntities.get(ename)
		if (!squidEFields) {
//			console.log(`Subgraph entity "${ename}" not found in the squid`)
			entityIssues.push(`entity not found in the squid`)
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

		if (entityIssues.length>0) {
			console.log(`Issues with entity "${ename}":`)
			for (let iss of entityIssues) {
				console.log(`  ${iss}`)
			}
			console.log(`Entity fields:\n  in subgraph : ${efields.map(f => f.name)}\n  in squid    : ${squidEFields && squidEFields.map(f => f.name)}`)
			console.log('')
		}
	}
}

function compareStrayQueries(subgraphStrayQueries, squidStrayQueries) {
	const subgraphsq = subgraphStrayQueries.filter(q => q!=='_meta')
	const squidsq = squidStrayQueries.filter(q => q!=='squidStatus')
	if (subgraphsq.length>0 || squidsq.length>0) {
		console.log(`Found queries not related to any entities:\n  squid: ${JSON.stringify(squidsq)}\n  subgraph: ${JSON.stringify(subgraphsq)}`)
	}
}

const subgraphEndpointUrl = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens'
const squidEndpointUrl = 'https://squid.subsquid.io/yat1ma30-ens-abernatskiy-test/v/v1/graphql'

const { entities: subgraphEntities, nonEntityQueries: subgraphStrayQueries } =
	parseSchema(getEndpointSchema(subgraphEndpointUrl), 'subgraph')
const { entities: squidEntities, nonEntityQueries: squidStrayQueries } =
	parseSchema(getEndpointSchema(squidEndpointUrl), 'squid')

compareStrayQueries(subgraphStrayQueries, squidStrayQueries)
compareEntities(subgraphEntities, squidEntities)

