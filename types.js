export function describeType(typeObj) {
	if (typeObj.name!==null) {
		return typeObj.name
	}
	return `${typeObj.kind.toLowerCase()} ${describeType(typeObj.ofType)}`
}
