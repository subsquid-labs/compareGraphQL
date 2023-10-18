import request from 'sync-request'

const introspectionQuery = 'query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description locations args { ...InputValue } } } }  fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } }  fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue }  fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }'

export function queryEndpoint(url, query) {
	const response = request('POST', url, {
		headers: {
			'content-type': 'application/json',
			'accept': 'application/json'
		},
		json: {query}
	})
	if (response.statusCode!==200) {
		throw new Error(`The following query to ${url} has failed: ${query}`)
	}
	return response
}

export function getEndpointSchema(url) {
	const introspectionResponse = queryEndpoint(url, introspectionQuery)
	return JSON.parse(introspectionResponse.body.toString()).data.__schema
}
