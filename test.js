import { queryEndpoint, getEndpointSchema } from './graphql.js'
import { getSquidEntities, getSubgraphEntities, getEntitiesFields } from './entities.js'

//const endpointUrl = 'https://squid.subsquid.io/yat1ma30-ens-abernatskiy-test/v/v1/graphql'
const endpointUrl = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens'
const schema = getEndpointSchema(endpointUrl)

//const { entities, nonEntityQueries } = getSquidEntities(schema)
const { entities, nonEntityQueries } = getSubgraphEntities(schema)

//console.log(entities)
//console.log(nonEntityQueries)

const entitiesFields = getEntitiesFields(entities, schema)
console.log(entitiesFields)
