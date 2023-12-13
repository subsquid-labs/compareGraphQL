#!/usr/bin/env node

import { Command } from 'commander'
import { standardComparison } from '../lib/tests/standard-comparison.js'

const program = new Command()
program
	.description('Subsquid vs subgraph API comparator')
	.argument('<subgraph_url>', 'URL of the subgraph API')
	.argument('<squid_url>', 'URL of the squid API')
	.option('-r, --repeats <number>', 'number of records to retrieve in each test', '10')
	.option('--temporal-ignore-ids', 'ignore IDs in the temporal test')
	.option('--non-temporal-lower-case-ids', 'lowercase IDs when doing the non-temporal test')
program.parse()

const subgraphEndpointUrl = program.args[0]
const squidEndpointUrl = program.args[1]
const numRecords = parseInt(program.opts().repeats)
const temporalIgnoreIds = !!program.opts().temporalIgnoreIds
const nonTemporalLowerCaseIds = !!program.opts().nonTemporalLowerCaseIds

standardComparison(
  { apiUrl: subgraphEndpointUrl, kind: 'subgraph' },
  { apiUrl: squidEndpointUrl, kind: 'squid' },
  { numRecords, temporalIgnoreIds, nonTemporalLowerCaseIds }
)
