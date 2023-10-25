import { queryEndpoint } from './graphql.js'
import { isScalar } from './types.js'

export function compareStrayQueries(subgraphStrayQueries, squidStrayQueries) {
	const subgraphsq = subgraphStrayQueries.filter(q => q!=='_meta')
	const squidsq = squidStrayQueries.filter(q => q!=='squidStatus')
	if (subgraphsq.length>0 || squidsq.length>0) {
		return {
			humanReadableComparison: `Found queries not related to any entities:\n  squid: ${JSON.stringify(squidsq)}\n  subgraph: ${JSON.stringify(subgraphsq)}`
		}
	}
	return { humanReadableComparison: null }
}

export function compareEntities(subgraphEntities, squidEntities) {
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
				entityIssuesDescription += `\nEntity fields:\n  in subgraph : ${efields.map(f => f.name)}\n  in squid    : ${squidEFields && squidEFields.map(f => f.name)}`
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

export function separateEntitiesByTemporalFields(entities, options = {}) {
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

export function testTemporalEntitiesOnAscendingRecords(
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

		const subgraphQuery = `{ ${ename}s(first: ${numRecords}, orderBy: ${orderByField}, orderDirection: asc, orderBy: id, orderDirection: asc) { ${queryFields.join(' ')} } }`

		const capitalizedSquidEntityName = [...squidEntities.keys()].find(k => k.toLowerCase()==ename.toLowerCase())
		const squidQuery = `{ ${capitalizedSquidEntityName}s(limit: ${numRecords}, orderBy: [${orderByField}_ASC, id_ASC]) { ${queryFields.join(' ')} } }`

		const rawSubgraphResponse = queryEndpoint(subgraphEndpointUrl, subgraphQuery)
		if (rawSubgraphResponse.errors) {
			console.error('errors:', rawSubgraphResponse.errors)
			process.exit(1)
		}
		const rawSquidResponse = queryEndpoint(squidEndpointUrl, squidQuery)
		if (rawSquidResponse.errors) {
			console.error('errors:', rawSquidResponse.errors)
			process.exit(1)
		}

		const subgraphResponse = rawSubgraphResponse.data[`${ename}s`]
		const squidResponse = rawSquidResponse.data[`${capitalizedSquidEntityName}s`]

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

export function testNonTemporalEntitiesOnCrossInclusion(
	nonTemporalSubgraphEntities,
	squidEntities,
	subgraphEndpointUrl,
	squidEndpointUrl,
	options = {}
) {
	/**
	 * Options fields:
	 *   numRecords - the number of records to compare
	 *   lowerCaseIds - apply .toLowerCase() to the ids retrieved from one API before using them in a WHERE query for the other
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

		const idTransform = options.lowerCaseIds ? (id => id.toLowerCase()) : (id => id)
		const inclusionQuery =
			direction==='subgraphToSquid' ?
			`{ ${squidEntityName}s(where: {id_in: [${someRecords.map(r => `"${idTransform(r.id)}"`).join(', ')}]}) { ${queryFields.join(' ')} } }` :
			`{ ${entityName}s(where: {id_in: [${someRecords.map(r => `"${idTransform(r.id)}"`).join(', ')}]}) { ${queryFields.join(' ')} } }`
		const includedRecords =
			direction==='subgraphToSquid' ?
			queryEndpoint(squidEndpointUrl, inclusionQuery).data[`${squidEntityName}s`] :
			queryEndpoint(subgraphEndpointUrl, inclusionQuery).data[`${squidEntityName}s`]

		const sampleSource = direction==='subgraphToSquid' ? 'subgraph' : 'squid'
		const testDestination = direction==='subgraphToSquid' ? 'squid' : 'subgraph'
		if (someRecords.length!==includedRecords.length) {
			issues.push(`number of same id records found in ${testDestination} (${includedRecords.length}) is different from the size of the sample retrieved from ${sampleSource} (${someRecords.length})`)
		}
		const includedRecordsMap = new Map(includedRecords.map(r => [idTransform(r.id), r]))
		for (let rec of someRecords) {
			const destRec = includedRecordsMap.get(idTransform(rec.id))
			if (!destRec) {
				issues.push(`record "${idTransform(rec.id)}" was not found by the ${testDestination}`)
			}
			else {
				for (let f of queryFields) {
					if (
						rec[f]!=destRec[f] &&
						!(f==='id' && idTransform(rec[f])==idTransform(destRec[f]))
					) {
						issues.push(`field ${f} differs in record "${rec.id}": "${rec[f]}" in ${sampleSource} vs "${destRec[f]}" in ${testDestination}`)
					}
				}
			}
		}
	}

	const allIssues = []
	for (let [ename, efields] of nonTemporalSubgraphEntities) {
		const queryFields = ['id'].concat(efields.filter(f => isScalar(f.type)).map(f => f.name))

		const forwardIssues = []
		checkRecordsInclusion(ename, queryFields, forwardIssues, 'subgraphToSquid')
		const backwardIssues = []
		checkRecordsInclusion(ename, queryFields, backwardIssues, 'squidToSubgraph')

		if (forwardIssues.length>0 || backwardIssues.length>0) {
			allIssues.push(`Issues with entity ${ename}:\n\n  ${forwardIssues.join('\n  ')}\n\n  ${backwardIssues.join('\n  ')}`)
		}
	}
	let humanReadableIssuesDescription = null
	if (allIssues.length>0) {
		humanReadableIssuesDescription = allIssues.join('\n\n')
	}
	return { humanReadableIssuesDescription }
}
