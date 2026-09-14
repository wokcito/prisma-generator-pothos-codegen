import type { ContractModel, ContractRelation, ContractScalarField, SchemaModel } from '../contract/schema'
import { getBuilderCalculatedImport } from '../utils/builderImport'
import type { ConfigInternal } from '../utils/config'
import { writeFile } from '../utils/filesystem'
import { useTemplate } from '../utils/template'

export const enumTemplate = `export const #{enumName} = builder.enumType('#{enumName}', {
  values: #{values} as const,
});`

export const sortOrderTemplate = `export const SortOrder = builder.enumType('SortOrder', {
  values: ['asc', 'desc'] as const,
});`

export const inputTemplate = `export const #{inputName}Fields = (t: any) => ({
  #{fields}
});
export const #{inputName} = builder.inputRef<unknown, false>('#{inputName}').implement({
  fields: #{inputName}Fields,
});`

export const dateTimeScalar = `export const DateTime = builder.scalarType('DateTime', {
  parseValue: (value) => {
    try {
      const date = new Date(value)
      if (date.toString() === 'Invalid Date') throw new Error('Invalid Date')
      return date
    } catch (error) {
      throw new Error('Invalid Date');
    }
  },
  serialize: (value) => value ? new Date(value) : null,
});`

export const decimalScalar = `export const Decimal = builder.scalarType('Decimal', {
  serialize: (value) => value?.toString() ?? null,
  parseValue: (value) => {
    if (value === null || value === undefined) throw new Error('Invalid Decimal');
    return value.toString();
  },
});`

export const bytesScalar = `export const Bytes = builder.scalarType('Bytes', {
  serialize: (value) => value,
  parseValue: (value) => {
    if (Array.isArray(value)) return Buffer.from(value);
    if (typeof value === 'string') return Buffer.from(value, 'utf8');
    throw new Error('Bytes must be string or array');
  },
});`

export const jsonScalar = `export const Json = builder.scalarType('Json', {
  serialize: (value) => value,
});`

export const bigIntScalar = `export const Bigint = builder.scalarType('BigInt', {
  serialize: (value) => value.toString(),
  parseValue: (value) => {
    try {
      return BigInt(value);
    } catch (error) {
      throw new Error('Invalid Bigint');
    }
  },
});`

const fieldLine = (name: string, type: string, required: boolean) =>
  `${name}: t.field({ type: ${type}, required: ${required} }),`

const scalarFieldType = (field: ContractScalarField, mapId: boolean, isId: boolean): string => {
  if (field.enumName) return field.enumName
  if (mapId && isId) return `'ID'`
  return `'${field.graphqlScalar}'`
}

const identityFields = (model: ContractModel): string[] => {
  const pk = model.primaryKey ?? []
  const singleUniques = model.uniques.filter((u) => u.length === 1).map((u) => u[0] as string)
  return [...new Set([...pk, ...singleUniques])]
}

const relationInputType = (rel: ContractRelation, suffix: string): string => {
  const ref = `${rel.targetModel}${suffix}`
  return rel.cardinality === '1:N' ? `[${ref}]` : ref
}

const makeWhereFields = (model: ContractModel): string =>
  [
    ...model.fields.map((f) => fieldLine(f.name, scalarFieldType(f, false, false), false)),
    ...model.relations.map((r) => fieldLine(r.name, relationInputType(r, 'WhereInput'), false)),
  ].join('\n  ')

const makeOrderByFields = (model: ContractModel): string =>
  model.fields.map((f) => fieldLine(f.name, 'SortOrder', false)).join('\n  ')

const makeUniqueFields = (model: ContractModel, mapId: boolean): string => {
  const ids = new Set(identityFields(model))
  return model.fields
    .filter((f) => ids.has(f.name))
    .map((f) => fieldLine(f.name, scalarFieldType(f, mapId, true), false))
    .join('\n  ')
}

const makeCreateFields = (model: ContractModel): string =>
  [
    ...model.fields.map((f) => fieldLine(f.name, scalarFieldType(f, false, false), !f.nullable && !f.hasDefault)),
    ...model.relations.map((r) => fieldLine(r.name, relationInputType(r, 'CreateInput'), false)),
  ].join('\n  ')

const makeUpdateFields = (model: ContractModel): string =>
  [
    ...model.fields.map((f) => fieldLine(f.name, scalarFieldType(f, false, false), false)),
    ...model.relations.map((r) => fieldLine(r.name, relationInputType(r, 'UpdateInput'), false)),
  ].join('\n  ')

const makeInput = (inputName: string, fields: string) =>
  fields.length > 0
    ? useTemplate(inputTemplate, { inputName, fields })
    : useTemplate(inputTemplate, {
        inputName,
        fields: `NEVER: t.field({ type: NEVER, required: false }),`,
      })

export const getEnums = (schema: SchemaModel): string =>
  schema.enums
    .map((e) => useTemplate(enumTemplate, { enumName: e.name, values: JSON.stringify(e.members) }))
    .join('\n\n')

export const getScalars = (schema: SchemaModel, excludeScalars: string[] = []): string => {
  const used = new Set(schema.models.flatMap((m) => m.fields.map((f) => f.graphqlScalar)))
  const excluded = new Set(excludeScalars)
  const parts: string[] = []
  if (used.has('DateTime') && !excluded.has('DateTime')) parts.push(dateTimeScalar)
  if (used.has('Decimal') && !excluded.has('Decimal')) parts.push(decimalScalar)
  if (used.has('Bytes') && !excluded.has('Bytes')) parts.push(bytesScalar)
  if (used.has('Json') && !excluded.has('Json')) parts.push(jsonScalar)
  if (used.has('BigInt') && !excluded.has('BigInt')) parts.push(bigIntScalar)
  return parts.join('\n\n')
}

export const getInputs = (schema: SchemaModel, config: ConfigInternal): string => {
  const mapId = config.inputs.mapIdFieldsToGraphqlId === 'WhereUniqueInputs'
  return schema.models
    .map((model) =>
      [
        makeInput(`${model.name}WhereInput`, makeWhereFields(model)),
        makeInput(`${model.name}OrderByWithRelationInput`, makeOrderByFields(model)),
        makeInput(`${model.name}WhereUniqueInput`, makeUniqueFields(model, mapId)),
        makeInput(`${model.name}CreateInput`, makeCreateFields(model)),
        makeInput(`${model.name}UpdateInput`, makeUpdateFields(model)),
      ].join('\n\n'),
    )
    .join('\n\n')
}

export const getImports = (config: ConfigInternal, fileLocation: string): string =>
  ['// @ts-nocheck', config.inputs.contractTypesImporter, getBuilderCalculatedImport({ config, fileLocation })].join(
    '\n',
  )

/**
 * Generates the Pothos input types file content from a Prisma 8 contract
 * schema. Pure function (no filesystem access) so it is easy to test.
 */
export function generateInputs(schema: SchemaModel, config: ConfigInternal): string {
  const fileLocation = config.inputs.outputFilePath

  const imports = getImports(config, fileLocation)
  const scalars = getScalars(schema, config.inputs.excludeScalars)
  const enums = getEnums(schema)
  const inputs = getInputs(schema, config)
  const content = [imports, sortOrderTemplate, scalars, enums, inputs].filter((part) => part.length > 0).join('\n\n')

  return content
}

/** Generates the inputs file and writes it to `config.inputs.outputFilePath`. */
export async function writeInputs(schema: SchemaModel, config: ConfigInternal): Promise<void> {
  await writeFile(config, 'inputs', generateInputs(schema, config), config.inputs.outputFilePath)
}
