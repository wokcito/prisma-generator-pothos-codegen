import type { DMMF } from '@prisma/generator-helper'
import type { NormalizedExposure, NormalizedField } from './exposureConfig'

const getField = (exposure: NormalizedExposure | undefined, modelName: string, fieldName: string) =>
  exposure?.models[modelName]?.fields[fieldName]

const check =
  (state: keyof Pick<NormalizedField, 'hidden' | 'guarded' | 'readonly' | 'unfilterable'>) =>
  (exposure: NormalizedExposure | undefined, modelName: string, fieldName: string): boolean =>
    getField(exposure, modelName, fieldName)?.[state] ?? false

/** Does not exist: neither in the object nor in any input or enum */
export const isHidden = check('hidden')
/** Access decided by the application at runtime: nullable, and its resolver asks the runtime */
export const isGuarded = check('guarded')
/** Out of the create and update inputs (`hidden` and the foreign keys of a `readonly` relation included) */
export const isReadonly = check('readonly')
/** Out of `where`, `orderBy`, `distinct` and `cursor` (`hidden` included) */
export const isUnfilterable = check('unfilterable')

const WHERE_SHAPED =
  /^(Where|WhereUnique|ScalarWhere|OrderByWithRelation|OrderByWithAggregation|ScalarWhereWithAggregates)Input$/
const AGGREGATE_ORDER_BY_SHAPED = /^(Count|Max|Min|Avg|Sum)OrderByAggregateInput$/
const WRITE_SHAPED = /^(Unchecked)?(Create|Update).*Input$/
// Inputs of relation operations (`where`, `data`, `create`, `update`, `connect`...): their keys are not model fields
const RELATION_OPERATION = /Nested|OrConnect|Envelope|WithWhere|ToOne|Upsert/

/**
 * Inputs whose fields are (a subset of) the fields of a model, by what they are used for:
 * - `filter`: `where`, `orderBy`, unique and aggregate order inputs. Fields `hidden` or `unfilterable` are removed
 * - `write`: create and update inputs, also the nested ones (`UserCreateWithoutPostsInput`). Fields `hidden` or
 *   `readonly` are removed
 * Inputs whose keys are operations (`UserUpdateManyWithWhereWithoutPostsInput` has `where`, `data`) are neither, even if
 * the model has a field named `data`.
 */
export const getInputFamily = (inputName: string, modelName: string): 'filter' | 'write' | undefined => {
  if (!inputName.startsWith(modelName)) return undefined
  const rest = inputName.slice(modelName.length)
  if (WHERE_SHAPED.test(rest) || AGGREGATE_ORDER_BY_SHAPED.test(rest)) return 'filter'
  if (WRITE_SHAPED.test(rest) && !RELATION_OPERATION.test(rest)) return 'write'
  return undefined
}

/** True when the state removes the field from an input of that family (see `getInputFamily`) */
export const isRemovedFromInput = (
  exposure: NormalizedExposure | undefined,
  family: 'filter' | 'write',
  modelName: string,
  fieldName: string,
): boolean =>
  family === 'filter' ? isUnfilterable(exposure, modelName, fieldName) : isReadonly(exposure, modelName, fieldName)

/**
 * Compound unique inputs (`PairABCompoundUniqueInput`) that contain a field that can not be filtered. They are dropped,
 * together with the `WhereUniqueInput` field that points to them, otherwise the field name would leak through them.
 */
export const getDroppedInputNames = (exposure: NormalizedExposure | undefined, dmmf: DMMF.Document): Set<string> => {
  const dropped = new Set<string>()
  if (!exposure) return dropped
  const inputs = new Map((dmmf.schema.inputObjectTypes.prisma ?? []).map((input) => [input.name, input]))

  for (const model of dmmf.datamodel.models) {
    const hidden = Object.values(exposure.models[model.name]?.fields ?? {})
      .filter((field) => field.unfilterable)
      .map((field) => field.name)
    if (!hidden.length) continue

    const whereUnique = inputs.get(`${model.name}WhereUniqueInput`)
    for (const field of whereUnique?.fields ?? []) {
      for (const { type } of field.inputTypes) {
        const compound = inputs.get(String(type))
        if (compound?.name.endsWith('CompoundUniqueInput') && compound.fields.some((f) => hidden.includes(f.name)))
          dropped.add(compound.name)
      }
    }
  }

  return dropped
}
