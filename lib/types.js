export function describeType(typeObj, options = {}) {
	/*
	 * options fields:
	 *   ignoreNonNulls
	 */
	if (typeObj.name!==null) {
		return typeObj.name
	}
	if (options.ignoreNonNulls && typeObj.kind==='NON_NULL') {
		return describeType(typeObj.ofType, options)
	}
	return `${typeObj.kind.toLowerCase()} ${describeType(typeObj.ofType, options)}`
}

export function isScalar(typeDesc) {
	const scalarTypes = new Set([
		'String',
		'Int',
		'Bytes',
		'Boolean',
		'BigInt',
		'BigDecimal'
	])
	return scalarTypes.has(typeDesc)
}
