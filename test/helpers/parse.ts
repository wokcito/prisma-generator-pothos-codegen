/** Small helpers to inspect generated source in tests */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Field names of a generated input, e.g. `getInputFieldNames(inputsFile, 'UserWhereInput')` */
export const getInputFieldNames = (inputsFile: string, inputName: string): string[] => {
  const match = inputsFile.match(
    new RegExp(`export const ${escapeRegExp(inputName)}Fields = \\(t: any\\) => \\(\\{\\n([\\s\\S]*?)\\n\\}\\);`),
  )
  if (!match) throw new Error(`Input "${inputName}" was not generated`)
  return [...(match[1] as string).matchAll(/^ {2}(\w+): t\./gm)].map((m) => m[1] as string)
}

export const hasInput = (inputsFile: string, inputName: string): boolean =>
  new RegExp(`export const ${escapeRegExp(inputName)}Fields = `).test(inputsFile)

/** Values of a generated enum, e.g. `UserScalarFieldEnum` */
export const getEnumValues = (inputsFile: string, enumName: string): string[] => {
  const match = inputsFile.match(
    new RegExp(`builder\\.enumType\\('${escapeRegExp(enumName)}', \\{\\n  values: (\\[.*?\\]) as const`),
  )
  if (!match) throw new Error(`Enum "${enumName}" was not generated`)
  return JSON.parse(match[1] as string)
}

/** Field names declared in the `fields: (t) => ({ ... })` of an object.base.ts */
export const getObjectFieldNames = (objectFile: string): string[] => {
  const match = objectFile.match(/fields: \(t\) => \(\{\n([\s\S]*?)\n {2}\}\),\n\}\);/)
  if (!match) throw new Error('Object fields block not found')
  return [...(match[1] as string).matchAll(/^ {4}(\w+): (?:t\.(?:field|relation)\(|\w+FieldObject\(t\))/gm)].map(
    (m) => m[1] as string,
  )
}

/** Names exported (defined) by an object.base.ts */
export const getDefinedExports = (objectFile: string): string[] =>
  [...objectFile.matchAll(/^export const (\w+) = /gm)].map((m) => m[1] as string)

/** Names re-exported from './object.base' by a model's index.ts */
export const getIndexObjectExports = (indexFile: string): string[] => {
  const match = indexFile.match(/export \{\n([\s\S]*?)\n\} from '\.\/object\.base';/)
  if (!match) return []
  return (match[1] as string)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Source of the `FieldObject` export for a field, up to the next top-level export */
export const getExportBlock = (file: string, exportName: string): string => {
  const start = file.indexOf(`export const ${exportName} = `)
  if (start === -1) throw new Error(`Export "${exportName}" not found`)
  const rest = file.slice(start + 1)
  const next = rest.search(/\nexport const /)
  return next === -1 ? file.slice(start) : file.slice(start, start + 1 + next)
}
