import { queryEndpoint } from '../graphql.js'
import { isScalar } from '../types.js'

export function compareStrayQueries(
	{ strayQueries: referenceStrayQueries, kind: referenceKind },
	{ strayQueries: sampleStrayQueries, kind: sampleKind}
) {
	function filterQueries(queries, kind) {
		if (kind==='squid')
			return queries.filter(q => q!=='squidStatus')
		if (kind==='subgraph')
			return queries.filter(q => q!=='_meta')
		throw new Error(`compareStrayQueries(): Unsupported API kind ${kind}`)
	}
	const referencesq = filterQueries(referenceStrayQueries, referenceKind)
	const samplesq = filterQueries(sampleStrayQueries, sampleKind)
	if (referencesq.length>0 || samplesq.length>0) {
		return {
			humanReadableComparison: `Found queries not related to any entities:\n  sample    : ${JSON.stringify(samplesq)}\n  reference : ${JSON.stringify(referencesq)}`
		}
	}
	return { humanReadableComparison: null }
}

export function compareEntities(
	{ entities: referenceEntities, kind: referenceKind },
	{ entities: sampleEntities, kind: sampleKind }
) {
	function idTypeIsCorrect(kind, idType) {
		return (kind==='squid' && idType==='String') || (kind==='subgraph' && idType==='ID')
	}

	let allIssues = []
	const safeEntities = []
	for (let [ename, efields] of referenceEntities) {
		const entityIssues = []
		let entityNotFound = false

		const sampleEName = [...sampleEntities.keys()].find(k => k.toLowerCase()===ename.toLowerCase())
		let sampleEFields
		if (!sampleEName) {
			entityIssues.push(`entity not found in the squid`)
			entityNotFound = true
		}
		else {
			sampleEFields = sampleEntities.get(sampleEName)
			if (efields.length!==sampleEFields.length) {
				entityIssues.push(`number of entity fields is different`)
			}
			for (const [i, f] of efields.entries()) {
				let sampleField = sampleEFields[i]
				let msg = []
				if (!sampleField) {
					msg.push('field not found in sample')
				}
				else {
					if (f.name!==sampleField.name) {
						msg.push(`name diff "${f.name}"!=="${sampleField.name}"`)
					}
					if (f.type!==sampleField.type &&
						!(f.name==='id' &&
						  sampleField.name==='id' &&
						  idTypeIsCorrect(referenceKind, f.type) &&
						  idTypeIsCorrect(sampleKind, sampleField.type))) {
						msg.push(`type diff "${f.type}"!=="${sampleField.type}"`)
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
				entityIssuesDescription += `\nEntity fields:\n  in reference : ${efields.map(f => f.name)}\n  in sample    : ${sampleEFields && sampleEFields.map(f => f.name)}`
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
	const temporalEntitiesNames = []
	const nonTemporalEntitiesNames = []
	for (let [ename, efields] of entities) {
		if (efields.map(f => f.name).filter(fn => temporalFields.includes(fn)).length > 0) {
			temporalEntitiesNames.push(ename)
		}
		else {
			nonTemporalEntitiesNames.push(ename)
		}
	}
	return { temporalEntitiesNames, nonTemporalEntitiesNames }
}

export function testTemporalEntitiesOnAscendingRecords(
	temporalEntitiesNames,
	{ entities: referenceEntities, apiUrl: referenceApiUrl, kind: referenceKind },
	{ entities: sampleEntities, apiUrl: sampleApiUrl, kind: sampleKind },
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

	function getQuery(entities, ename, queryFields, orderByField, kind) {
		const apiEName = [...entities.keys()].find(k => k.toLowerCase()==ename.toLowerCase())
		if (kind==='squid')
			return {
				query: `{ ${apiEName}s(limit: ${numRecords}, orderBy: [${orderByField}_ASC, id_ASC]) { ${queryFields.join(' ')} } }`,
				apiEName
			}
		if (kind==='subgraph')
			return {
				query: `{ ${apiEName}s(first: ${numRecords}, orderBy: ${orderByField}, orderDirection: asc, orderBy: id, orderDirection: asc) { ${queryFields.join(' ')} } }`,
				apiEName
			}
		throw new Error(`testTemporalEntitiesOnAscendingRecords(): Unsupported API kind ${kind}`)
	}

	const allIssues = []
	const temporalReferenceEntities = new Map([...referenceEntities.entries()].filter(e => temporalEntitiesNames.find(n => n===e[0])))
	for (let [ename, efields] of temporalReferenceEntities) {
		const queryFields = ['id'].concat(efields.filter(f => isScalar(f.type)).map(f => f.name))
		if (ignoreIds && queryFields.length<2) {
			console.log(`testTemporalEntitiesOnAscendingRecords(): WARNING - id is the only field for entity ${ename}, cannot ignore it`)
			ignoreIds = false
		}
		const orderByField = queryFields.find(f => temporalFields.includes(f))

		const {query: referenceQuery, apiEName: referenceApiEName} = getQuery(referenceEntities, ename, queryFields, orderByField, referenceKind)
		const {query: sampleQuery, apiEName: sampleApiEName} = getQuery(sampleEntities, ename, queryFields, orderByField, sampleKind)

		const rawReferenceResponse = queryEndpoint(referenceApiUrl, referenceQuery)
		if (rawReferenceResponse.errors) {
			console.error('errors:', rawReferenceResponse.errors)
			process.exit(1)
		}
		const rawSampleResponse = queryEndpoint(sampleApiUrl, sampleQuery)
		if (rawSampleResponse.errors) {
			console.error('errors:', rawSampleResponse.errors)
			process.exit(1)
		}

		const referenceResponse = rawReferenceResponse.data[`${referenceApiEName}s`]
		const sampleResponse = rawSampleResponse.data[`${sampleApiEName}s`]

		const issues = []
		if (referenceResponse.length===sampleResponse.length) {
			for (let [i, rec] of referenceResponse.entries()) {
				for (let f of queryFields) {
					if (f==='id' && ignoreIds) {
						continue
					}
					if (sampleResponse[i]==null) {
						issues.push(`for record ${i} the corresponding sample record was not found`)
					}
					else if (rec[f]!=sampleResponse[i][f]) {
						issues.push(`for record ${i} field ${f} differs: "${rec[f]}" in reference vs "${sampleResponse[i][f]}" in sample`)
					}
				}
			}
		}
		else {
			issues.push(`response lengths are inconsistent: ${referenceResponse.length} items from reference, ${sampleResponse.length} items from sample`)
		}

		if (issues.length>0) {
			allIssues.push(`Issues with entity ${ename} on queries:\nreference query : ${referenceQuery}\nsample query    : ${sampleQuery}\n${issues.join('\n  ')}`)
		}
	}
	return {
		humanReadableIssuesDescription: allIssues.length>0 ? allIssues.join('\n') : null
	}
}

export function testNonTemporalEntitiesOnCrossInclusion(
	nonTemporalEntitiesNames,
	{ entities: referenceEntities, apiUrl: referenceApiUrl, kind: referenceKind },
	{ entities: sampleEntities, apiUrl: sampleApiUrl, kind: sampleKind },
	options = {}
) {
	/**
	 * Options fields:
	 *   numRecords - the number of records to compare
	 *   lowerCaseIds - apply .toLowerCase() to the ids retrieved from one API before using them in a WHERE query for the other
	 */
	const numRecords = options.numRecords ?? 10

	function getSomeRecordsQuery(entityName, queryFields, kind) {
		if (kind==='squid')
			return `{ ${entityName}s(limit: ${numRecords}) { ${queryFields.join(' ')} } }`
		if (kind==='subgraph')
			return `{ ${entityName}s(first: ${numRecords}) { ${queryFields.join(' ')} } }`
		throw new Error(`testNonTemporalEntitiesOnCrossInclusion(): Unsupported API kind ${kind}`)
	}

	function getInclusionQuery(someRecords, entityName, queryFields, kind) {
		if (kind==='squid')
			return `{ ${entityName}s(limit: ${numRecords}) { ${queryFields.join(' ')} } }`
		if (kind==='subgraph')
			return `{ ${entityName}s(first: ${numRecords}) { ${queryFields.join(' ')} } }`
		throw new Error(`testNonTemporalEntitiesOnCrossInclusion(): Unsupported API kind ${kind}`)
	}

	function checkRecordsInclusion(referenceEntityName, queryFields, issues, direction) {
		const sampleEntityName = [...sampleEntities.keys()].find(k => k.toLowerCase()==referenceEntityName.toLowerCase())
		let someRecordsQuery = direction==='referenceToSample' ?
			getSomeRecordsQuery(referenceEntityName, queryFields, referenceKind) :
			getSomeRecordsQuery(sampleEntityName, queryFields, sampleKind)
		const someRecords = direction==='referenceToSample' ?
			queryEndpoint(referenceApiUrl, someRecordsQuery).data[`${referenceEntityName}s`] :
			queryEndpoint(sampleApiUrl, someRecordsQuery).data[`${sampleEntityName}s`]
		if (someRecords.length===0) {
			issues.push(`subgraph did not return any records (requested ${numRecords})`)
			return
		}

		const idTransform = options.lowerCaseIds ? (id => id.toLowerCase()) : (id => id)
		const inclusionQueryEntityName = direction==='referenceToSample' ? sampleEntityName : referenceEntityName
		const inclusionQuery = `{ ${inclusionQueryEntityName}s(where: {id_in: [${someRecords.map(r => `"${idTransform(r.id)}"`).join(', ')}]}) { ${queryFields.join(' ')} } }`
		const includedRecords =
			direction==='referenceToSample' ?
			queryEndpoint(sampleApiUrl, inclusionQuery).data[`${sampleEntityName}s`] :
			queryEndpoint(referenceApiUrl, inclusionQuery).data[`${referenceEntityName}s`]

		const sampleSource = direction==='referenceToSample' ? 'reference' : 'sample'
		const testDestination = direction==='referenceToSample' ? 'sample' : 'reference'
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

	const nonTemporalReferenceEntities = new Map([...referenceEntities.entries()].filter(e => nonTemporalEntitiesNames.find(n => n===e[0])))

	const allIssues = []
	for (let [ename, efields] of nonTemporalReferenceEntities) {
		const queryFields = ['id'].concat(efields.filter(f => isScalar(f.type)).map(f => f.name))

		const forwardIssues = []
		checkRecordsInclusion(ename, queryFields, forwardIssues, 'referenceToSample')
		const backwardIssues = []
		checkRecordsInclusion(ename, queryFields, backwardIssues, 'sampleToReference')

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
