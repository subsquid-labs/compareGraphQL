#!/usr/bin/env node

import { Command } from 'commander'

import { parseSchema } from '../lib/entities.js'
import { getEndpointSchema } from '../lib/graphql.js'
import {
	compareStrayQueries,
	compareEntities,
	separateEntitiesByTemporalFields,
	testTemporalEntitiesOnAscendingRecords,
	testNonTemporalEntitiesOnCrossInclusion
} from '../lib/test.js'

const program = new Command()
program
	.description('Subsquid vs subgraph API comparator')
	.argument('<subgraph_url>', 'URL of the subgraph API')
	.argument('<squid_url>', 'URL of the squid API')
program.parse()

const subgraphEndpointUrl = program.args[0]
const squidEndpointUrl = program.args[1]

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
