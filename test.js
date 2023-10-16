const request = require('sync-request')
const assert = require('assert')

const introspectionQuery = "query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description locations args { ...InputValue } } } }  fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } }  fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue }  fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }"

const introspectionResponse = request('POST', 'https://squid.subsquid.io/ens-squid-nomindart-test/v/v1/graphql', {
	headers: {
		'content-type': 'application/json',
		'accept': 'application/json'
	},
	json: {query: introspectionQuery}
})

assert(introspectionResponse.statusCode===200)

const schema = JSON.parse(introspectionResponse.body.toString()).data.__schema

const queries = schema.types.find(t => t.kind==='OBJECT' && t.name==='Query').fields

console.log(queries.map(q => q.name))

function getEntities(queries) {
	const entities = new Map()
	function updateByPostfix(query, postfix) {
		if (query.endsWith(postfix)) {
			let entityName = query.slice(0, -1*postfix.length)
			if (entities.has(entityName)) {
				entities.set(entityName, entities.get(entityName)+1)
			}
			else {
				entities.set(entityName, 1)
			}
		}
	}
	for (let q of queries) {
		if (q === 'squidStatus') continue
		updateByPostfix(q, 's')
		updateByPostfix(q, 'ById')
		updateByPostfix(q, 'ByUniqueInput')
		updateByPostfix(q, 'sConnection')
	}
	const nonPassing = [...entities.entries()].filter(e => e[1]<4).map(e => e[0])
	if (nonPassing.length>0) console.log('There were non-passing entity candidates', nonPassing)
	return [...entities.entries()].filter(e => e[1]===4).map(e => e[0])
}

const confirmedEntities = getEntities(queries.map(q => q.name))

const sQueries = new Map(confirmedEntities.map(e => [e, queries.find(q => q.name===`${e}s`)]))

const objTypes = new Map(schema.types.filter(t => t.kind==='OBJECT').map(t => [t.name, t]))

console.log([...sQueries.values()].map(q => objTypes.get(q.type.ofType.ofType.ofType.name).fields.map(f => f.name)))
