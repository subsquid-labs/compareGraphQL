export function getSquidEntities(schema) {
	/*
	 * A string that has four query methods, suffixed
	 * 's', 'ById', 'ByUniqueInput', 'sConnection'
	 * is considered a valid entity name. Warning will
	 * be printed if for some string only a subset of
	 * these query methods is present.
	 */
	const queries = getQueries(schema).map(q => q.name)
	const entities = new Map()
	for (let q of queries) {
		if (q === 'squidStatus') continue
		updateEntitiesMapByPostfix(entities, q, 's')
		updateEntitiesMapByPostfix(entities, q, 'ById')
		updateEntitiesMapByPostfix(entities, q, 'ByUniqueInput')
		updateEntitiesMapByPostfix(entities, q, 'sConnection')
	}
	const nonPassing = [...entities.entries()].filter(e => e[1]<4).map(e => e[0])
	if (nonPassing.length>0) console.log('getSquidEntities(): some entity candidates did not have all the required queries and were discarded', nonPassing)
	//console.log(entities)
	const confirmedEntities = [...entities.entries()].filter(e => e[1]===4).map(e => e[0])
	const entityQueries = new Set([...confirmedEntities].map(e => [`${e}s`, `${e}ById`, `${e}ByUniqueInput`, `${e}sConnection`]).reduce((a, v) => a.concat(v), []))
	return {
		entities: confirmedEntities,
		nonEntityQueries: queries.filter(q => !entityQueries.has(q))
	}
}

export function getSubgraphEntities(schema) {
	/*
	 * A string that has four query methods, suffixed
	 * '', 's'
	 * is considered a valid entity name. Warning will
	 * be printed if for some string only a subset of
	 * these query methods is present.
	 */
	const queries = getQueries(schema).map(q => q.name)
	const entities = new Map()
	for (let q of queries) {
		updateEntitiesMapByPostfix(entities, q, 's')
	}
	for (let q of queries) {
		if (entities.has(q)) {
			entities.set(q, entities.get(q)+1)
		}
	}
	const nonPassing = [...entities.entries()].filter(e => e[1]<2).map(e => e[0])
	if (nonPassing.length>0) console.log('getSubgraphEntities(): some entity candidates did not have all the required queries and were discarded', nonPassing)
	//console.log(entities)
	const confirmedEntities = [...entities.entries()].filter(e => e[1]===2).map(e => e[0])
	const entityQueries = new Set([...confirmedEntities].map(e => [`${e}`, `${e}s`]).reduce((a, v) => a.concat(v), []))
	return {
		entities: confirmedEntities,
		nonEntityQueries: queries.filter(q => !entityQueries.has(q))
	}
}

export function getEntitiesFields(entities, schema) {
	/*
	 * Field names and types are inferred from the type of
	 * 's'-suffixed queries
	 */
	const queries = getQueries(schema)
	const sQueries = new Map(entities.map(e => [e, queries.find(q => q.name===`${e}s`)]))

	const objTypes = new Map(schema.types.filter(t => (t.kind==='OBJECT' || t.kind==='INTERFACE') && t.name!=='Query').map(t => [t.name, t]))

//	return new Map([...sQueries.entries()].map(e => [e[0], objTypes.get(e[1].type.ofType.ofType.ofType.name).fields.map(f => { return f.type })]))
	return new Map([...sQueries.entries()].map(e => [e[0], objTypes.get(e[1].type.ofType.ofType.ofType.name).fields.map(f => { return {name: f.name, type: f.type} })]))
}

function getQueries(schema) {
	return schema.types.find(t => t.kind==='OBJECT' && t.name==='Query').fields
}

function updateEntitiesMapByPostfix(entitiesMap, query, postfix) {
	if (query.endsWith(postfix)) {
		let entityName = query.slice(0, -1*postfix.length)
		if (entitiesMap.has(entityName)) {
			entitiesMap.set(entityName, entitiesMap.get(entityName)+1)
		}
		else {
			entitiesMap.set(entityName, 1)
		}
	}
}
