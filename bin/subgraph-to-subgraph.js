#!/usr/bin/env node

import { Command } from 'commander'
import { standardComparison } from '../lib/tests/standard-comparison.js'

const program = new Command()
program
	.description('Subgraph vs subgraph API comparator')
	.argument('<reference_subgraph_url>', 'URL of the reference subgraph API')
	.argument('<sample_subgraph_url>', 'URL of the sample subgraph API')
	.option('-r, --repeats <number>', 'number of records to retrieve in each test', '10')
	.option('--temporal-ignore-ids', 'ignore IDs in the temporal test')
	.option('--non-temporal-lower-case-ids', 'lowercase IDs when doing the non-temporal test')
program.parse()

const referenceEndpointUrl = program.args[0]
const sampleEndpointUrl = program.args[1]
const numRecords = parseInt(program.opts().repeats)
const temporalIgnoreIds = !!program.opts().temporalIgnoreIds
const nonTemporalLowerCaseIds = !!program.opts().nonTemporalLowerCaseIds

standardComparison(
  { apiUrl: referenceEndpointUrl, kind: 'subgraph' },
  { apiUrl: sampleEndpointUrl, kind: 'subgraph' },
  { numRecords, temporalIgnoreIds, nonTemporalLowerCaseIds }
)
