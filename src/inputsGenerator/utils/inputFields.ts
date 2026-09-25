import type { DMMF } from '@prisma/generator-helper'
import type { ConfigInternal } from '../../utils/config'
import { getInputFamily, isRemovedFromInput } from '../../utils/exposure'
import type { NormalizedExposure } from '../../utils/exposureConfig'
import { firstLetterLowerCase, firstLetterUpperCase } from '../../utils/string'
import { getMainInput } from './dmmf'
import { parseComment } from './parser'

export type InputFields = {
  /** Code of the fields (and the comments of the omitted ones) */
  code: string
  /** Fields that are emitted, to know which other inputs, enums and scalars they reach */
  kept: DMMF.SchemaArg[]
  /** The input has no field left: it is emitted with the `NEVER` scalar */
  usesNever: boolean
}

/** Convert array of fields to a string code representation */
export const getInputFields = (
  input: DMMF.InputType,
  model: DMMF.Model | undefined,
  config: ConfigInternal,
  /** Inputs removed by `crud.exposure` (see `getDroppedInputNames`): fields that point to them are removed too */
  droppedInputs: ReadonlySet<string> = new Set(),
  exposure?: NormalizedExposure,
): InputFields => {
  const omitted: { name: string; reason: string }[] = []
  const simple = config.inputs.simple

  /** Fields removed by `crud.exposure`. Removed silently: a comment would leak the name of the hidden field */
  const family = model ? getInputFamily(input.name, model.name) : undefined
  const isHiddenByExposure = (field: DMMF.SchemaArg) => {
    if (field.inputTypes.some(({ type }) => droppedInputs.has(String(type)))) return true
    if (!model || !family) return false
    return (
      model.fields.some((f) => f.name === field.name) && isRemovedFromInput(exposure, family, model.name, field.name)
    )
  }

  const filtered = input.fields.filter((field) => {
    if (isHiddenByExposure(field)) return false

    // Fields are filtered for simple mode if this is enabled
    if (
      simple &&
      ['create', 'connectOrCreate', 'createMany', 'upsert', 'update', 'updateMany', 'delete', 'deleteMany'].includes(
        field.name,
      )
    ) {
      omitted.push({ name: field.name, reason: '`simple mode: true` found in global config' })
      return false
    }

    // Description is parsed for @Pothos.omit() comments and input fields are filtered
    const modelField = model?.fields.find((f) => f.name === field.name)

    if (!modelField || !modelField.documentation) return true

    const omitTypes = parseComment(modelField.documentation)

    if (!omitTypes) return true
    if (
      omitTypes === 'all' ||
      omitTypes.some(
        (omitType) =>
          input.name.startsWith(`${model?.name}${firstLetterUpperCase(omitType)}`) ||
          input.name.startsWith(`${model?.name}Unchecked${firstLetterUpperCase(omitType)}`),
      )
    ) {
      omitted.push({ name: field.name, reason: '@Pothos.omit found in schema comment' })
      return false
    }

    return true
  })

  // Convert remaining fields to string representation
  const fields =
    filtered.length === 0
      ? ['_: t.field({ type: NEVER }),']
      : filtered.map((field) => {
          const { isList, type, location } = getMainInput().run(field.inputTypes)
          const props = { required: field.isRequired, description: undefined }

          const defaultScalarList = ['String', 'Int', 'Float', 'Boolean']
          const isScalar = location === 'scalar' && defaultScalarList.includes(type.toString())

          const getFieldType = () => {
            if (isList) {
              return `${type}List`
            }

            if (isScalar && config.inputs.mapIdFieldsToGraphqlId === 'WhereUniqueInputs') {
              const fieldDetails = model?.fields.find((f) => f.name === field.name)
              if (fieldDetails?.isId) {
                return 'id'
              }
            }
            return type.toString()
          }

          const getScalar = () => {
            // TODO parse date to string ??
            const fieldType = getFieldType()
            return `${firstLetterLowerCase(fieldType)}(${JSON.stringify(props)})`
          }

          const getField = () => {
            // BigInt is reserved
            const renamedType = type === 'BigInt' ? 'Bigint' : type
            const fieldType = isList ? `[${renamedType}]` : renamedType.toString()
            const relationProps = { ...props, type: fieldType }
            // "type":"CommentCreateInput" -> "type":CommentCreateInput
            return `field(${JSON.stringify(relationProps).replace(/(type.+:)"(.+)"/, '$1$2')})`
          }

          return `${field.name}: t.${isScalar ? getScalar() : getField()},`
        })

  const sep = '\n  '
  const code = `${fields.join(sep)}${omitted.length > 0 ? sep : ''}${omitted
    .map((o) => `// '${o.name}' was omitted due to ${o.reason}`)
    .join(sep)}`
  return { code, kept: filtered, usesNever: filtered.length === 0 }
}

export const getInputFieldsString = (...args: Parameters<typeof getInputFields>): string => getInputFields(...args).code
