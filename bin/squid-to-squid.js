#!/usr/bin/env node

import { Command } from 'commander'
import { standardComparison } from '../lib/tests/standard-comparison.js'

const program = new Command()
program
	.description('Squid vs squid API comparator')
	.argument('<reference_squid_url>', 'URL of the reference squid API')
	.argument('<sample_squid_url>', 'URL of the sample squid API')
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
  { apiUrl: referenceEndpointUrl, kind: 'squid' },
  { apiUrl: sampleEndpointUrl, kind: 'squid' },
  { numRecords, temporalIgnoreIds, nonTemporalLowerCaseIds }
)
