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
