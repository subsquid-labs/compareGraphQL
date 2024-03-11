/*
 * Includes
 *   - schema comparison
 *   - ascending order records comparison for temporal entities
 *   - inclusion test from non-temporal entities
 */

import { parseSchema } from '../entities.js'
import { getEndpointSchema } from '../graphql.js'
import {
	compareStrayQueries,
	compareEntities,
	separateEntitiesByTemporalFields,
	testTemporalEntitiesOnAscendingRecords,
	testNonTemporalEntitiesOnCrossInclusion
} from './components.js'

export function standardComparison(
	{ apiUrl: referenceApiUrl, kind: referenceKind },
	{ apiUrl: sampleApiUrl, kind: sampleKind },
	{ numRecords, temporalIgnoreIds, nonTemporalLowerCaseIds }
) {
	/**
	 * Test results are printed to stdout
   */

	const { entities: referenceEntities, nonEntityQueries: referenceStrayQueries } =
		parseSchema(getEndpointSchema(referenceApiUrl), referenceKind)
	const { entities: sampleEntities, nonEntityQueries: sampleStrayQueries } =
		parseSchema(getEndpointSchema(sampleApiUrl), sampleKind)

	const {
		humanReadableComparison: strayQueriesComparison
	} = compareStrayQueries(
		{ strayQueries: referenceStrayQueries, kind: referenceKind },
		{ strayQueries: sampleStrayQueries, kind: sampleKind }
	)
	if (strayQueriesComparison)
		console.log(`${strayQueriesComparison}\n\n---------------------\n`)
	else
		console.log('Did not find any queries not associated with entities')

	console.log(`Comparing ${referenceEntities.size} entities of the reference API to ${sampleEntities.size} entities of the sample API`)
	console.log(`Reference entities:` , [...referenceEntities.keys()])
	const {
		humanReadableIssuesDescription: schemaIssues,
		safeEntities: safeEntitiesNames
	} = compareEntities(
		{ entities: referenceEntities, kind: referenceKind },
		{ entities: sampleEntities, kind: sampleKind }
	)
	if (schemaIssues)
		console.log(`${schemaIssues}\n\n---------------------\n`)
	else
		console.log('No issues found during the schema comparison')

	const safeReferenceEntities = new Map([...referenceEntities.entries()].filter(e => safeEntitiesNames.has(e[0])))

	const {
		temporalEntitiesNames: temporalReferenceEntitiesNames,
		nonTemporalEntitiesNames: nonTemporalReferenceEntitiesNames
	} = separateEntitiesByTemporalFields(safeReferenceEntities)

	console.log(`Detected ${temporalReferenceEntitiesNames.length} temporal entities and ${nonTemporalReferenceEntitiesNames.length} non-temporal entities`)

	console.log(`Testing all entities as non-temporal`)
/*
	const {
		humanReadableIssuesDescription: temporalEntitiesIssues
	} = testTemporalEntitiesOnAscendingRecords(
		temporalReferenceEntitiesNames,
		{ entities: referenceEntities, apiUrl: referenceApiUrl, kind: referenceKind },
		{ entities: sampleEntities, apiUrl: sampleApiUrl, kind: sampleKind },
		{ ignoreIds: temporalIgnoreIds, numRecords }
	)
	if (temporalEntitiesIssues)
		console.log(`${temporalEntitiesIssues}\n\n---------------------\n`)
	else
		console.log('No issues found with temporal entities')
*/
	const {
		humanReadableIssuesDescription: nonTemporalEntitiesIssues
	} = testNonTemporalEntitiesOnCrossInclusion(
		temporalReferenceEntitiesNames.concat(nonTemporalReferenceEntitiesNames),
		{ entities: referenceEntities, apiUrl: referenceApiUrl, kind: referenceKind },
		{ entities: sampleEntities, apiUrl: sampleApiUrl, kind: sampleKind },
		{ numRecords, lowerCaseIds: nonTemporalLowerCaseIds }
	)
	if (nonTemporalEntitiesIssues)
		console.log(`${nonTemporalEntitiesIssues}\n\n---------------------\n`)
	else
		console.log('No issues found with non-temporal entities')
}
