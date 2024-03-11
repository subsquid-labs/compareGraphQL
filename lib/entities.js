import { describeType } from './types.js'

export function squidPluralize(entityName) {
	const dict = new Map([
		['factory', 'factories'],
		['Factory', 'Factories'],
		['data', 'data'],
		['Data', 'Data'],
		['flash', 'flashes'],
		['Flash', 'Flashes'],
	])
	for (const [ singularPostfix, pluralPostfix ] of dict) {
		if (entityName.endsWith(singularPostfix)) {
			return entityName.replace(new RegExp(singularPostfix + '$'), pluralPostfix)
		}
	}
	return entityName + 's'
}

export function subgraphPluralize(entityName) {
	const dict = new Map([
		['factory', 'factories'],
		['Factory', 'Factories'],
		['flash', 'flashes'],
		['Flash', 'Flashes'],
	])
	for (const [ singularPostfix, pluralPostfix ] of dict) {
		if (entityName.endsWith(singularPostfix)) {
			return entityName.replace(new RegExp(singularPostfix + '$'), pluralPostfix)
		}
	}
	return entityName + 's'
}

export function pluralize(entityName, apiFormat) {
	if (apiFormat === 'squid') {
		return squidPluralize(entityName)
	}
	else if (apiFormat === 'subgraph') {
		return subgraphPluralize(entityName)
	}
	throw new Error(`getEntitiesFields(): Unknown API format ${apiFormat}`)
}

export function getSquidEntities(schema) {
	/*
	 * A string that has four query methods:
	 *   - two suffixed with 'ById' and 'ByUniqueInput'
	 *   - one pluralized base and one same + 'Connection'
	 * is considered a valid entity name. Warning will
	 * be printed if for some string only a subset of
	 * these query methods is present.
	 */
	const queries = new Set(getQueries(schema).map(q => q.name))
	const entities = new Map()
	for (let q of queries) {
		if (q === 'squidStatus') continue
		updateEntitiesMapByPostfix(entities, q, 'ById')
		updateEntitiesMapByPostfix(entities, q, 'ByUniqueInput')
	}
	for (let ename of entities.keys()) {
		if (queries.has(squidPluralize(ename))) {
			entities.set(ename, entities.get(ename)+1)
		}
		if (queries.has(squidPluralize(ename) + 'Connection')) {
			entities.set(ename, entities.get(ename)+1)
		}
	}

	const nonPassing = [...entities.entries()].filter(e => e[1]<4).map(e => e[0])
	if (nonPassing.length>0) console.log('getSquidEntities(): some entity candidates did not have all the required queries and were discarded', nonPassing)
	//console.log(entities)
	const confirmedEntities = [...entities.entries()].filter(e => e[1]===4).map(e => e[0])
	const entityQueries = new Set([...confirmedEntities].map(e => [`${squidPluralize(e)}`, `${e}ById`, `${e}ByUniqueInput`, `${squidPluralize(e)}Connection`]).reduce((a, v) => a.concat(v), []))
	return {
		entities: confirmedEntities,
		nonEntityQueries: [...queries].filter(q => !entityQueries.has(q))
	}
}

export function getSubgraphEntities(schema) {
	/*
	 * A string that has two query methods such that
	 * one is the pluralized other
	 * is considered a valid entity name. Warning will
	 * be printed if for some string only a subset of
	 * these query methods is present.
	 */
	const queries = new Set(getQueries(schema).map(q => q.name))
	const entities = new Map()
	for (let q of queries) {
		if (queries.has(subgraphPluralize(q))) {
			entities.set(q, 2)
		}
	}
	const nonPassing = [...entities.entries()].filter(e => e[1]<2).map(e => e[0])
	if (nonPassing.length>0) console.log('getSubgraphEntities(): some entity candidates did not have all the required queries and were discarded', nonPassing)
	//console.log(entities)
	const confirmedEntities = [...entities.entries()].filter(e => e[1]===2).map(e => e[0])
	const entityQueries = new Set([...confirmedEntities].map(e => [`${e}`, `${subgraphPluralize(e)}`]).reduce((a, v) => a.concat(v), []))
	return {
		entities: confirmedEntities,
		nonEntityQueries: [...queries].filter(q => !entityQueries.has(q))
	}
}

export function getEntitiesFields(entities, schema, apiFormat, options = {}) {
	/*
	 * Field names and types are inferred from the type of
	 * list queries
	 *
	 * Options fields:
	 *   ignoreNonNulls - omit non-null statements when describing field types
	 */
	const queries = getQueries(schema)
	const sQueries = new Map(entities.map(e => [e, queries.find(q => q.name===pluralize(e, apiFormat))]))

	const objTypes = new Map(schema.types.filter(t => (t.kind==='OBJECT' || t.kind==='INTERFACE') && t.name!=='Query').map(t => [t.name, t]))

	// careful with the options passed right through here: collisions are possible as the new local options are added
	return new Map([...sQueries.entries()].map(e => [e[0], objTypes.get(e[1].type.ofType.ofType.ofType.name).fields.map(f => { return {name: f.name, type: describeType(f.type, options)} })]))
}

export function parseSchema(schema, apiFormat) {
	/*
	 * apiFormat may be 'squid' or 'subgraph'
	 */
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

	const entitiesFields = getEntitiesFields(entities, schema, apiFormat, {ignoreNonNulls: true})
	return {
		entities: entitiesFields,
		nonEntityQueries
	}
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
