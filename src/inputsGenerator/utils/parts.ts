import type { DMMF } from '@prisma/generator-helper'
import { getBuilderCalculatedImport, isOperationEnabled } from '../../crudGenerator/utils/parts'
import type { ConfigInternal } from '../../utils/config'
import { getDroppedInputNames, isHidden, isUnfilterable } from '../../utils/exposure'
import { type NormalizedExposure, OPERATIONS, type Operation } from '../../utils/exposureConfig'
import { useTemplate } from '../../utils/template'
import { getMainInput, getUsedScalars, type UsedScalars } from './dmmf'
import { getInputFields } from './inputFields'
import * as T from './templates'

/** `<Model>ScalarFieldEnum` (used by `distinct`) lists the scalars of a model: the ones that can not be filtered are removed */
const withoutUnfilterableFields = (
  exposure: NormalizedExposure | undefined,
  modelOfEnum: ReadonlyMap<string, DMMF.Model>,
  el: { name: string; values: readonly string[] },
) => {
  const model = modelOfEnum.get(el.name)
  if (!model) return el
  return { ...el, values: el.values.filter((value) => !isUnfilterable(exposure, model.name, value)) }
}

/** @param reachable names of the enums to emit. Without it every enum is emitted */
export const getEnums = (dmmf: DMMF.Document, exposure?: NormalizedExposure, reachable?: ReadonlySet<string>) => {
  const modelOfEnum = new Map<string, DMMF.Model>()
  for (const model of dmmf.datamodel.models) {
    modelOfEnum.set(`${model.name}ScalarFieldEnum`, model)
    modelOfEnum.set(`${model.name}OrderByRelevanceFieldEnum`, model)
  }
  return [
    ...dmmf.schema.enumTypes.prisma,
    ...dmmf.datamodel.enums.map((el) => ({ ...el, values: el.values.map(({ name }) => name) })),
  ]
    .filter((el) => !reachable || reachable.has(el.name))
    .map((el) => (exposure ? withoutUnfilterableFields(exposure, modelOfEnum, el) : el))
    .map((el) => useTemplate(T.enumTemplate, { enumName: el.name, values: JSON.stringify(el.values) }))
    .join('\n\n')
}

export const getImports = (config: ConfigInternal, fileLocation: string) =>
  // Add ts-nocheck command to get rid of "Excessive stack depth comparing types" error.
  ['// @ts-nocheck', config.inputs.prismaImporter, getBuilderCalculatedImport({ config, fileLocation })].join('\n')

/** @param used scalars used by what is emitted. Without it they are read from every input of Prisma, as in 1.0.0 */
export const getScalars = ({ inputs: { excludeScalars } }: ConfigInternal, dmmf: DMMF.Document, used?: UsedScalars) => {
  const usedScalars = used ?? getUsedScalars(dmmf.schema.inputObjectTypes.prisma ?? [])
  return [
    ...(usedScalars.hasDateTime && !excludeScalars?.includes('DateTime') ? [T.dateTimeScalar] : []),
    ...(usedScalars.hasDecimal && !excludeScalars?.includes('Decimal') ? [T.decimalScalar] : []),
    ...(usedScalars.hasBytes && !excludeScalars?.includes('Bytes') ? [T.bytesScalar] : []),
    ...(usedScalars.hasJson && !excludeScalars?.includes('Json') ? [T.jsonScalar] : []),
    ...(usedScalars.hasBigInt && !excludeScalars?.includes('BigInt') ? [T.bigIntScalar] : []),
    ...(usedScalars.hasNEVER && !excludeScalars?.includes('NEVER') ? [T.neverScalar] : []),
  ].join('\n\n')
}

export const getUtil = () => `type Filters = {
  string: Prisma.StringFieldUpdateOperationsInput;
  nullableString: Prisma.NullableStringFieldUpdateOperationsInput;
  dateTime: Prisma.DateTimeFieldUpdateOperationsInput;
  nullableDateTime: Prisma.NullableDateTimeFieldUpdateOperationsInput;
  int: Prisma.IntFieldUpdateOperationsInput;
  nullableInt: Prisma.NullableIntFieldUpdateOperationsInput;
  bool: Prisma.BoolFieldUpdateOperationsInput;
  nullableBool: Prisma.NullableBoolFieldUpdateOperationsInput;
  bigInt: Prisma.BigIntFieldUpdateOperationsInput;
  nullableBigInt: Prisma.NullableBigIntFieldUpdateOperationsInput;
  bytes: Prisma.BytesFieldUpdateOperationsInput;
  nullableBytes: Prisma.NullableBytesFieldUpdateOperationsInput;
  float: Prisma.FloatFieldUpdateOperationsInput;
  nullableFloat: Prisma.NullableFloatFieldUpdateOperationsInput;
  decimal: Prisma.DecimalFieldUpdateOperationsInput;
  nullableDecimal: Prisma.NullableDecimalFieldUpdateOperationsInput;
};

type ApplyFilters<InputField> = {
  [F in keyof Filters]: 0 extends 1 & Filters[F]
    ? never
    : Filters[F] extends InputField
    ? Filters[F]
    : never;
}[keyof Filters];

type PrismaUpdateOperationsInputFilter<T extends object> = {
  [K in keyof T]: [ApplyFilters<T[K]>] extends [never] ? T[K] : ApplyFilters<T[K]>
};`

type Candidate = {
  input: DMMF.InputType
  /** Name it is emitted with (`Unchecked` is removed) */
  name: string
  code: string
  kept: DMMF.SchemaArg[]
  usesNever: boolean
}

export type GeneratedInputs = {
  code: string
  /** Scalars used by the inputs that were emitted (and by the objects, when the inputs are pruned) */
  used: UsedScalars
  /** Enums to emit. `undefined` when nothing is pruned: every enum is emitted */
  enums: Set<string> | undefined
}

const customScalars = {
  DateTime: 'hasDateTime',
  Decimal: 'hasDecimal',
  Bytes: 'hasBytes',
  Json: 'hasJson',
  BigInt: 'hasBigInt',
} as const

/** Inputs, enums and scalars that the generated crud uses directly (its args and its objects) */
const getRoots = (config: ConfigInternal, exposure: NormalizedExposure, dmmf: DMMF.Document) => {
  const inputs = new Set<string>(exposure.keepInputs)
  const enums = new Set<string>(exposure.keepInputs)
  const scalars = emptyScalars()

  const rootsByOperation = (model: string): Record<Operation, string[]> => ({
    findFirst: [`${model}WhereInput`, `${model}OrderByWithRelationInput`, `${model}WhereUniqueInput`],
    findMany: [`${model}WhereInput`, `${model}OrderByWithRelationInput`, `${model}WhereUniqueInput`],
    count: [`${model}WhereInput`, `${model}OrderByWithRelationInput`, `${model}WhereUniqueInput`],
    findUnique: [`${model}WhereUniqueInput`],
    createOne: [`${model}CreateInput`],
    createMany: [`${model}CreateInput`],
    deleteMany: [`${model}WhereInput`],
    deleteOne: [`${model}WhereUniqueInput`],
    updateMany: [`${model}WhereInput`, `${model}UpdateManyMutationInput`],
    updateOne: [`${model}WhereUniqueInput`, `${model}UpdateInput`],
    upsertOne: [`${model}WhereUniqueInput`, `${model}CreateInput`, `${model}UpdateInput`],
  })
  const listArgs = (model: string) => {
    inputs.add(`${model}WhereInput`)
    inputs.add(`${model}OrderByWithRelationInput`)
    inputs.add(`${model}WhereUniqueInput`)
    enums.add(`${model}ScalarFieldEnum`)
  }

  const userEnums = new Set(dmmf.datamodel.enums.map((e) => e.name))
  for (const model of dmmf.datamodel.models) {
    if (!exposure.emittedModels.has(model.name)) continue
    for (const operation of OPERATIONS) {
      if (!isOperationEnabled(config, exposure, model.name, operation)) continue
      for (const name of rootsByOperation(model.name)[operation]) inputs.add(name)
      if (['findFirst', 'findMany', 'count'].includes(operation)) enums.add(`${model.name}ScalarFieldEnum`)
    }

    // The objects: their scalars and enums, and the args of their list relations
    for (const field of model.fields) {
      if (isHidden(exposure, model.name, field.name)) continue
      if (field.kind === 'object') {
        if (field.isList) listArgs(field.type)
      } else if (userEnums.has(field.type)) enums.add(field.type)
      else if (field.type in customScalars) scalars[customScalars[field.type as keyof typeof customScalars]] = true
    }
  }

  return { inputs, enums, scalars }
}

const emptyScalars = (): UsedScalars => ({
  hasDateTime: false,
  hasDecimal: false,
  hasBytes: false,
  hasJson: false,
  hasBigInt: false,
  hasNEVER: false,
})

/**
 * Emits only what the enabled operations and the objects reach (breadth first over the fields that are emitted): fewer
 * types for Pothos to build, no inputs of operations that do not exist, and the scalars and `NEVER` are defined only if they
 * are used by what is emitted.
 */
const pruneInputs = (
  config: ConfigInternal,
  exposure: NormalizedExposure,
  dmmf: DMMF.Document,
  candidates: Candidate[],
): GeneratedInputs => {
  const roots = getRoots(config, exposure, dmmf)
  const byName = new Map<string, Candidate[]>()
  for (const candidate of candidates) byName.set(candidate.name, [...(byName.get(candidate.name) ?? []), candidate])

  const reached = new Set<string>()
  const enums = new Set(roots.enums)
  const used = { ...roots.scalars }
  const queue = [...roots.inputs]

  while (queue.length) {
    const name = queue.pop() as string
    if (reached.has(name)) continue
    reached.add(name)

    for (const candidate of byName.get(name) ?? []) {
      if (candidate.usesNever) used.hasNEVER = true
      for (const field of candidate.kept) {
        const { type, location } = getMainInput().run(field.inputTypes)
        const typeName = String(type).replaceAll('Unchecked', '')
        if (location === 'inputObjectTypes') queue.push(typeName)
        else if (location === 'enumTypes') enums.add(typeName)
        else if (location === 'scalar' && typeName in customScalars)
          used[customScalars[typeName as keyof typeof customScalars]] = true
      }
    }
  }

  return {
    code: candidates
      .filter((candidate) => reached.has(candidate.name))
      .map((candidate) => candidate.code)
      .join('\n\n'),
    used,
    enums,
  }
}

const makeInputs = (
  config: ConfigInternal,
  dmmf: DMMF.Document,
  inputNames: PrefixIndex,
  exposure?: NormalizedExposure,
): GeneratedInputs => {
  const droppedInputs = getDroppedInputNames(exposure, dmmf)

  const candidates: Candidate[] = (dmmf.schema.inputObjectTypes.prisma ?? [])
    // Filter out irrelevant input types
    .filter(
      (input) =>
        !droppedInputs.has(input.name) &&
        (['Filter', 'Compound', 'UpdateOperations'].some((allowedKeyword) => input.name.includes(allowedKeyword)) ||
          inputNames.find(input.name) !== undefined),
    )
    .map((input) => {
      const model = inputNames.find(input.name)
      const { code, kept, usesNever } = getInputFields(input, model, config, droppedInputs, exposure)
      const name = input.name.replace('Unchecked', '')

      return {
        input,
        name,
        kept,
        usesNever,
        code: useTemplate(T.inputTemplate, {
          inputName: name,
          prismaInputName: input.name,
          fields: code.replaceAll('Unchecked', ''),
        }),
      }
    })

  // With `crud.exposure` (and generated crud) only what is reached is emitted. Without crud nothing says what is used
  if (exposure && !config.crud.disabled) return pruneInputs(config, exposure, dmmf, candidates)

  const emitted = candidates.map((candidate) => candidate.code).join('\n\n')
  if (!exposure)
    return { code: emitted, used: getUsedScalars(dmmf.schema.inputObjectTypes.prisma ?? []), enums: undefined }

  // The scalars and `NEVER` are recalculated over what is emitted: fields removed by `crud.exposure` may leave an input
  // empty, and `NEVER` must be defined exactly when something uses it
  const used = emptyScalars()
  for (const candidate of candidates) {
    if (candidate.usesNever) used.hasNEVER = true
    for (const field of candidate.kept) {
      const { type, location } = getMainInput().run(field.inputTypes)
      if (location === 'scalar' && String(type) in customScalars)
        used[customScalars[String(type) as keyof typeof customScalars]] = true
    }
  }
  return { code: emitted, used, enums: undefined }
}

/**
 * Maps input names to their model by prefix (`UserWhere` -> `User`). The first key (in insertion order) that is a prefix of
 * the name wins, as with a linear scan, but it costs one lookup per key length instead of one comparison per key: a
 * schema has `models x keywords` keys and thousands of inputs to look up.
 */
class PrefixIndex {
  private keys = new Map<string, { order: number; model: DMMF.Model }>()
  private lengths: number[] = []

  add(key: string, model: DMMF.Model) {
    const existing = this.keys.get(key)
    // Like assigning to an object key: the position of the first insertion, the last value
    this.keys.set(key, { order: existing?.order ?? this.keys.size, model })
    if (!this.lengths.includes(key.length)) this.lengths = [...this.lengths, key.length].sort((a, b) => a - b)
  }

  find(name: string): DMMF.Model | undefined {
    let best: { order: number; model: DMMF.Model } | undefined
    for (const length of this.lengths) {
      if (length > name.length) break
      const found = this.keys.get(name.slice(0, length))
      if (found && (!best || found.order < best.order)) best = found
    }
    return best?.model
  }
}

const simpleKeywords = [
  'UncheckedCreateInput',
  'CreateNestedManyWithout',
  'UncheckedUpdateInput',
  'UpdateManyMutationInput',
  'UpdateManyWithout',
  'OrderByWithRelationInput',
  'OrderByRelationAggregateInput',
  'Where',
]

const keywords = [
  'Where',
  'ScalarWhere',
  'Create',
  'Update',
  'Upsert',
  'OrderBy',
  'CountOrderBy',
  'MaxOrderBy',
  'MinOrderBy',
  'AvgOrderBy',
  'SumOrderBy',
]

export const getInputs = (
  config: ConfigInternal,
  dmmf: DMMF.Document,
  exposure?: NormalizedExposure,
): GeneratedInputs => {
  // Map from possible input names to their related model
  const inputNames = new PrefixIndex()
  for (const model of dmmf.datamodel.models)
    for (const keyword of config.inputs.simple ? simpleKeywords : keywords)
      inputNames.add(`${model.name}${keyword}`, model)

  return makeInputs(config, dmmf, inputNames, exposure)
}
