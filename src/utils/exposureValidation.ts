import type { DMMF } from '@prisma/generator-helper'
import { isOperationEnabled } from '../crudGenerator/utils/parts'
import type { ConfigInternal } from './config'
import {
  buildExposure,
  collectExposureProblems,
  didYouMean,
  type NormalizedExposure,
  type Operation,
  UNIQUE_OPERATIONS,
} from './exposureConfig'

const uniqueKeysOf = (model: DMMF.Model): string[][] => [
  ...model.fields.filter((f) => f.isId || f.isUnique).map((f) => [f.name]),
  ...(model.primaryKey ? [[...model.primaryKey.fields]] : []),
  ...model.uniqueFields.map((fields) => [...fields]),
  ...model.uniqueIndexes.map((index) => [...index.fields]),
]

const enabledOperations = (
  config: ConfigInternal,
  exposure: NormalizedExposure,
  model: string,
  ops: readonly Operation[],
) => ops.filter((operation) => isOperationEnabled(config, exposure, model, operation))

const isGenerated = (config: ConfigInternal, exposure: NormalizedExposure, model: string) =>
  config.crud.disabled || exposure.emittedModels.has(model)

/** Names that `keepInputs` asks to keep must exist (a typo would silently keep nothing) */
const validateKeepInputs = (exposure: NormalizedExposure, dmmf: DMMF.Document, problems: string[]) => {
  const known = new Set([
    ...(dmmf.schema.inputObjectTypes.prisma ?? []).map((input) => input.name.replaceAll('Unchecked', '')),
    ...dmmf.schema.enumTypes.prisma.map((e) => e.name),
    ...dmmf.datamodel.enums.map((e) => e.name),
  ])
  for (const name of exposure.keepInputs)
    if (!known.has(name))
      problems.push(
        `crud.exposure.keepInputs: "${name}" is not an input or enum of the schema${didYouMean(name, [...known])}`,
      )
}

/** `<Model>ScalarFieldEnum` (used by `distinct`) would be empty, and Pothos fails to build an enum without values */
const validateVisibleScalars = (
  config: ConfigInternal,
  exposure: NormalizedExposure,
  dmmf: DMMF.Document,
  problems: string[],
) => {
  for (const model of dmmf.datamodel.models) {
    if (!isGenerated(config, exposure, model.name)) continue
    const fields = exposure.models[model.name]?.fields ?? {}
    const scalars = model.fields.filter((f) => f.kind !== 'object')
    const removed = scalars.filter((f) => fields[f.name]?.unfilterable)
    if (!scalars.length || removed.length < scalars.length) continue
    const hidden = scalars.filter((f) => fields[f.name]?.hidden)
    // Only `hidden` (or `unfilterable`) fields leave the enum
    problems.push(
      `crud.exposure.models.${model.name}.fields: every scalar field of model "${model.name}" is ${
        hidden.length === removed.length ? 'hidden' : 'hidden or unfilterable'
      } [${removed.map((f) => f.name).join(', ')}], which would leave ${model.name}ScalarFieldEnum empty. Keep at least one field visible`,
    )
  }
}

/** Hiding every unique key of a model leaves `WhereUniqueInput` unusable, so the operations that take it can not be enabled */
const validateUniqueKeys = (
  config: ConfigInternal,
  exposure: NormalizedExposure,
  dmmf: DMMF.Document,
  problems: string[],
) => {
  if (config.crud.disabled) return

  for (const model of dmmf.datamodel.models) {
    if (!isGenerated(config, exposure, model.name)) continue
    const fields = exposure.models[model.name]?.fields ?? {}
    const removed = Object.values(fields)
      .filter((field) => field.unfilterable)
      .map((field) => field.name)
    const keys = uniqueKeysOf(model)
    if (!removed.length || !keys.length) continue
    if (keys.some((key) => !key.some((field) => removed.includes(field)))) continue

    const enabled = enabledOperations(config, exposure, model.name, UNIQUE_OPERATIONS)
    if (!enabled.length) continue

    problems.push(
      `crud.exposure.models.${model.name}: model "${model.name}" has no unique identifier left after hiding [${removed.join(', ')}], but ${enabled.join(', ')} ${enabled.length > 1 ? 'are' : 'is'} still enabled. Disable them or hide other fields`,
    )
  }
}

/** A required column that clients can not write makes `createOne` and `createMany` fail on every call */
const validateRequiredWrites = (
  config: ConfigInternal,
  exposure: NormalizedExposure,
  dmmf: DMMF.Document,
  problems: string[],
) => {
  if (config.crud.disabled) return

  for (const model of dmmf.datamodel.models) {
    const enabled = enabledOperations(config, exposure, model.name, ['createOne', 'createMany'])
    if (!enabled.length) continue

    for (const field of model.fields) {
      const state = exposure.models[model.name]?.fields[field.name]
      const required = field.kind !== 'object' && field.isRequired && !field.hasDefaultValue && !field.isUpdatedAt
      if (!state?.readonly || !required) continue
      problems.push(
        `crud.exposure.models.${model.name}.fields.${field.name}: "${model.name}.${field.name}" is required in Prisma and ${state.hidden ? 'hidden' : 'readonly'}, so ${enabled[0]} cannot work. Remove ${enabled.join(' and ')} from operations`,
      )
    }
  }
}

/** A guarded to-one relation is checked against the id of the row it points to */
const validateGuardedRelations = (exposure: NormalizedExposure, dmmf: DMMF.Document, problems: string[]) => {
  for (const model of dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.kind !== 'object' || field.isList || !exposure.models[model.name]?.fields[field.name]?.guarded) continue
      const target = dmmf.datamodel.models.find((m) => m.name === field.type)
      const hasSingleId = target?.fields.some((f) => f.isId) && !target.primaryKey
      if (!hasSingleId)
        problems.push(
          `crud.exposure.models.${model.name}.fields.${field.name}: cannot guard the relation "${field.name}": model "${field.type}" needs a single-field @id to check the rows it returns`,
        )
    }
  }
}

/**
 * Fails the generation, with an actionable message listing every problem, when `crud.exposure` is invalid.
 * It also runs when `crud.disabled` is `true`: the field states govern the inputs too.
 */
export const validateExposure = (config: ConfigInternal, dmmf: DMMF.Document): void => {
  const raw = config.crud.exposure
  if (raw === undefined) return

  const problems = collectExposureProblems(raw, dmmf)
  const exposure = buildExposure(raw, dmmf)

  if (exposure.usesOperations) {
    const { excludeResolversContain, excludeResolversExact, includeResolversContain, includeResolversExact } =
      config.crud
    if (
      [excludeResolversContain, excludeResolversExact, includeResolversContain, includeResolversExact].some(
        (l) => l.length,
      )
    )
      problems.push(
        'crud.exposure.operations: use either crud.exposure.operations or excludeResolvers*/includeResolvers*, not both',
      )
  }

  validateKeepInputs(exposure, dmmf, problems)
  validateVisibleScalars(config, exposure, dmmf, problems)
  validateUniqueKeys(config, exposure, dmmf, problems)
  validateRequiredWrites(config, exposure, dmmf, problems)
  validateGuardedRelations(exposure, dmmf, problems)

  // Nothing to generate is a mistake, not an empty schema: `Objects.Model` would be `never` and autocrud.ts would not compile
  // (only when the rest is valid: an invalid config would add noise)
  if (!problems.length && !config.crud.disabled && exposure.emittedModels.size === 0)
    problems.push(
      'crud.exposure: no model is generated. With operations, only the models listed in crud.exposure.models (or reached by a visible relation of one of them) are generated: list at least one, for instance models: { User: {} }',
    )

  if (problems.length) throw new Error(`Invalid pothos-codegen configuration:\n - ${problems.join('\n - ')}`)
}
