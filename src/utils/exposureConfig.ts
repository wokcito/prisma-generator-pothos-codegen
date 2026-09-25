import type { DMMF } from '@prisma/generator-helper'
import type { ExposureState } from './config'

export const OPERATIONS = [
  'findMany',
  'findUnique',
  'findFirst',
  'count',
  'createOne',
  'createMany',
  'updateOne',
  'updateMany',
  'upsertOne',
  'deleteOne',
  'deleteMany',
] as const
export type Operation = (typeof OPERATIONS)[number]

/** Order in which the states are listed (manifest, messages) */
export const STATES = ['unfilterable', 'readonly', 'guarded', 'hidden'] as const

export const QUERY_OPERATIONS: readonly Operation[] = ['findMany', 'findUnique', 'findFirst', 'count']

/** Resolvers that are plain fields (`(root, args, ctx, info)`) instead of `prismaField`. Same list as `autocrud.ts` */
export const FLAT_OPERATIONS: readonly Operation[] = ['count', 'deleteMany', 'updateMany']

/** Resolvers that take a `WhereUniqueInput` */
export const UNIQUE_OPERATIONS: readonly Operation[] = ['findUnique', 'deleteOne', 'updateOne', 'upsertOne']

const ROOT_KEYS = ['operations', 'maxTake', 'manifest', 'keepInputs', 'models'] as const
const MODEL_KEYS = ['fields', 'operations', 'maxTake'] as const

export type NormalizedField = {
  name: string
  kind: 'scalar' | 'relation'
  /** As declared, without duplicates, in a fixed order */
  states: ExposureState[]
  /** Effective: `hidden` implies the other two, and a `readonly` relation makes its foreign keys `readonly` */
  hidden: boolean
  guarded: boolean
  readonly: boolean
  unfilterable: boolean
}

export type NormalizedModel = {
  name: string
  /** Enabled operations and their tags, in a fixed order */
  operations: Partial<Record<Operation, string[]>>
  maxTake: number | undefined
  fields: Record<string, NormalizedField>
  /** No `operations` and no `fields` of its own */
  usesDefaults: boolean
}

export type NormalizedExposure = {
  models: Record<string, NormalizedModel>
  manifestPath: string | undefined
  keepInputs: string[]
  /** `exposure.operations` is used somewhere: it replaces `excludeResolvers*` / `includeResolvers*` */
  usesOperations: boolean
  /**
   * Models that are generated. With `operations` a model is generated only if it has operations or a visible relation of
   * a generated model reaches it: the rest do not exist in the schema. Without `operations`, every model
   */
  emittedModels: Set<string>
  warnings: string[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const show = (value: unknown): string =>
  value === null
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'string'
        ? JSON.stringify(value)
        : String(typeof value === 'object' ? 'object' : value)

const typeName = (value: unknown) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

/** Edit distance (Levenshtein) */
const distance = (a: string, b: string): number => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] as number
      row[j] = Math.min(current + 1, (row[j - 1] as number) + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length] as number
}

/** ` (did you mean "x"?)` when a valid name is within edit distance 2 (or only differs by case) */
export const didYouMean = (name: string, valid: readonly string[]): string => {
  let best: string | undefined
  let bestDistance = 3
  for (const candidate of valid) {
    const d = candidate.toLowerCase() === name.toLowerCase() ? 0 : distance(name, candidate)
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }
  return best === undefined ? '' : ` (did you mean "${best}"?)`
}

const at = (path: string) => (path ? `crud.exposure.${path}` : 'crud.exposure')

/** Problems of the raw config that only need the schema (never the rest of the config). Every one is reported */
export const collectExposureProblems = (raw: unknown, dmmf: DMMF.Document): string[] => {
  const problems: string[] = []
  const add = (path: string, message: string) => problems.push(`${at(path)}: ${message}`)

  if (!isObject(raw)) {
    add('', `must be an object, got ${typeName(raw)}`)
    return problems
  }

  const models = dmmf.datamodel.models
  const modelNames = models.map((m) => m.name)

  const checkKeys = (path: string, value: Record<string, unknown>, valid: readonly string[]) => {
    for (const key of Object.keys(value))
      if (!valid.includes(key))
        add(path, `unknown key "${key}". Valid keys: ${valid.join(', ')}${didYouMean(key, valid)}`)
  }

  const checkMaxTake = (path: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
      add(path ? `${path}.maxTake` : 'maxTake', `maxTake must be a positive integer, got ${show(value)}`)
  }

  const checkTags = (path: string, value: unknown) => {
    const tags = Array.isArray(value) ? value : [value]
    for (const tag of tags) if (typeof tag !== 'string') add(path, `tag must be a string, got ${typeName(tag)}`)
  }

  const checkOperations = (path: string, value: unknown, isModel: boolean, hasGlobal: boolean) => {
    const unknownOperation = (name: unknown) =>
      add(
        path,
        `operation ${typeof name === 'string' ? `"${name}"` : show(name)} does not exist. Available operations: ${OPERATIONS.join(', ')}${typeof name === 'string' ? didYouMean(name, OPERATIONS) : ''}`,
      )

    if (Array.isArray(value)) {
      for (const name of value) if (!OPERATIONS.includes(name as Operation)) unknownOperation(name)
      return
    }
    if (!isObject(value)) {
      add(path, `operations must be a list of operations or an object of operations, got ${typeName(value)}`)
      return
    }
    for (const [name, tags] of Object.entries(value)) {
      if (name === 'inherit') {
        if (typeof tags !== 'boolean') add(`${path}.inherit`, `inherit must be a boolean, got ${typeName(tags)}`)
        else if (!isModel) add(`${path}.inherit`, '"inherit" is only valid in the operations of a model')
        else if (tags && !hasGlobal) add(`${path}.inherit`, '"inherit" needs crud.exposure.operations to inherit from')
        continue
      }
      if (!OPERATIONS.includes(name as Operation)) {
        unknownOperation(name)
        continue
      }
      if (typeof tags === 'boolean') continue
      checkTags(`${path}.${name}`, tags)
    }
  }

  checkKeys('', raw, ROOT_KEYS)

  if (raw.maxTake !== undefined) checkMaxTake('', raw.maxTake)
  if (raw.operations !== undefined) checkOperations('operations', raw.operations, false, false)
  const hasGlobal = raw.operations !== undefined

  if (raw.manifest !== undefined) {
    if (!isObject(raw.manifest)) add('manifest', `must be an object with a "path", got ${typeName(raw.manifest)}`)
    else {
      checkKeys('manifest', raw.manifest, ['path'])
      if (typeof raw.manifest.path !== 'string' || !raw.manifest.path)
        add('manifest.path', `path must be a non-empty string, got ${show(raw.manifest.path)}`)
    }
  }

  if (raw.keepInputs !== undefined) {
    if (!Array.isArray(raw.keepInputs) || raw.keepInputs.some((name) => typeof name !== 'string'))
      add('keepInputs', 'must be a list of input or enum names')
  }

  if (raw.models !== undefined) {
    if (!isObject(raw.models)) add('models', `must be an object, got ${typeName(raw.models)}`)
    else {
      const names = Object.keys(raw.models)
      for (const [modelName, modelConfig] of Object.entries(raw.models)) {
        const path = `models.${modelName}`
        const model = models.find((m) => m.name === modelName)
        if (!model) {
          const twin = names.find((other) => other !== modelName && other.toLowerCase() === modelName.toLowerCase())
          add(
            path,
            twin && modelNames.includes(twin)
              ? `model "${modelName}" is a duplicate of "${twin}": model names are case sensitive. Available models: ${modelNames.join(', ')}`
              : `model "${modelName}" does not exist. Available models: ${modelNames.join(', ')}${didYouMean(modelName, modelNames)}`,
          )
          continue
        }
        if (!isObject(modelConfig)) {
          add(path, `must be an object, got ${typeName(modelConfig)}`)
          continue
        }

        checkKeys(path, modelConfig, MODEL_KEYS)
        if (modelConfig.maxTake !== undefined) checkMaxTake(path, modelConfig.maxTake)
        if (modelConfig.operations !== undefined)
          checkOperations(`${path}.operations`, modelConfig.operations, true, hasGlobal)

        if (modelConfig.fields === undefined) continue
        if (!isObject(modelConfig.fields)) {
          add(`${path}.fields`, `must be an object, got ${typeName(modelConfig.fields)}`)
          continue
        }
        const fieldNames = model.fields.map((f) => f.name)
        for (const [fieldName, declared] of Object.entries(modelConfig.fields)) {
          const fieldPath = `${path}.fields.${fieldName}`
          const field = model.fields.find((f) => f.name === fieldName)
          if (!field) {
            add(
              fieldPath,
              `field "${fieldName}" does not exist on model "${modelName}". Available fields: ${fieldNames.join(', ')}${didYouMean(fieldName, fieldNames)}`,
            )
            continue
          }
          const states = Array.isArray(declared) ? declared : [declared]
          const invalid = states.filter((state) => !STATES.includes(state as ExposureState))
          for (const state of invalid)
            add(
              fieldPath,
              `unknown state ${typeof state === 'string' ? `"${state}"` : show(state)}. Valid states: ${STATES.join(', ')}${typeof state === 'string' ? didYouMean(state, STATES) : ''}`,
            )
          if (invalid.length) continue
          if (states.includes('hidden') && new Set(states).size > 1)
            add(fieldPath, '"hidden" cannot be combined with other states')
          if (states.includes('guarded') && field.kind === 'object' && field.isList)
            add(
              fieldPath,
              `"${fieldName}" is a list relation: it cannot be guarded, list relations are restricted with scope`,
            )
        }
      }
    }
  }

  return problems
}

const sortStates = (states: Iterable<string>): ExposureState[] =>
  STATES.filter((state) => new Set(states).has(state)) as ExposureState[]

/** Tags of one operation from the config value (`true`, `[]`, `'tag'`, `['a', 'b']`) */
const tagsOf = (value: unknown, warn: (message: string) => void, where: string): string[] => {
  const tags = (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []) as string[]
  const unique = [...new Set(tags)]
  if (unique.length !== tags.length) warn(`${where}: repeated tag in [${tags.join(', ')}], it is used once`)
  return unique
}

/** Operations of an `operations` config value. `inherit` starts from `base` */
const resolveOperations = (
  value: unknown,
  base: Partial<Record<Operation, string[]>> | undefined,
  warn: (message: string) => void,
  path: string,
): Partial<Record<Operation, string[]>> => {
  const result: Partial<Record<Operation, string[]>> = {}
  const enabled = new Map<Operation, string[]>()

  if (Array.isArray(value)) for (const name of value as Operation[]) enabled.set(name, [])
  else if (isObject(value)) {
    if (value.inherit === true && base)
      for (const [name, tags] of Object.entries(base)) enabled.set(name as Operation, tags)
    for (const [name, tags] of Object.entries(value)) {
      if (name === 'inherit') continue
      if (tags === false || tags === undefined) enabled.delete(name as Operation)
      else enabled.set(name as Operation, tagsOf(tags, warn, `crud.exposure.${path}.${name}`))
    }
  }

  for (const name of OPERATIONS) {
    const tags = enabled.get(name)
    if (tags) result[name] = tags
  }
  return result
}

const allOperations = (): Partial<Record<Operation, string[]>> =>
  Object.fromEntries(OPERATIONS.map((name) => [name, []]))

/**
 * Resolves the config against the schema. It is lenient (what is invalid is ignored: `collectExposureProblems`
 * reports it) and it never mutates its input.
 */
export const buildExposure = (raw: unknown, dmmf: DMMF.Document): NormalizedExposure => {
  const config = isObject(raw) ? raw : {}
  const warnings: string[] = []
  const warn = (message: string) => warnings.push(message)
  const modelsConfig = isObject(config.models) ? config.models : {}

  const globalOperations =
    config.operations === undefined ? undefined : resolveOperations(config.operations, undefined, warn, 'operations')
  const globalMaxTake = typeof config.maxTake === 'number' ? config.maxTake : undefined
  const listed = new Set(Object.keys(modelsConfig))
  const usesOperations =
    config.operations !== undefined ||
    Object.values(modelsConfig).some((model) => isObject(model) && model.operations !== undefined)

  const models: Record<string, NormalizedModel> = {}
  for (const model of dmmf.datamodel.models) {
    const own = isObject(modelsConfig[model.name]) ? (modelsConfig[model.name] as Record<string, unknown>) : {}
    const declared = isObject(own.fields) ? own.fields : {}

    // With `operations`, a model that is not in `models` has none: what is not asked for is not generated
    const operations =
      own.operations !== undefined
        ? resolveOperations(own.operations, globalOperations, warn, `models.${model.name}.operations`)
        : usesOperations && !listed.has(model.name)
          ? {}
          : (globalOperations ?? allOperations())

    // Declared states, then the effective ones
    const fields: Record<string, NormalizedField> = {}
    for (const field of model.fields) {
      const value = declared[field.name]
      const states = sortStates((Array.isArray(value) ? value : value === undefined ? [] : [value]) as string[])
      const hidden = states.includes('hidden')
      fields[field.name] = {
        name: field.name,
        kind: field.kind === 'object' ? 'relation' : 'scalar',
        states,
        hidden,
        guarded: states.includes('guarded'),
        readonly: hidden || states.includes('readonly'),
        unfilterable: hidden || states.includes('unfilterable'),
      }
    }
    // A readonly relation also closes its foreign keys, which would otherwise be a way to assign it (mass assignment)
    for (const field of model.fields) {
      if (field.kind !== 'object' || !fields[field.name]?.states.includes('readonly')) continue
      for (const fromField of field.relationFromFields ?? []) {
        const foreignKey = fields[fromField]
        if (foreignKey) foreignKey.readonly = true
      }
    }

    models[model.name] = {
      name: model.name,
      operations,
      maxTake: typeof own.maxTake === 'number' ? own.maxTake : globalMaxTake,
      fields,
      usesDefaults:
        (listed.has(model.name) || !usesOperations) &&
        own.operations === undefined &&
        Object.keys(declared).length === 0,
    }
  }

  const manifest =
    isObject(config.manifest) && typeof config.manifest.path === 'string' ? config.manifest.path : undefined
  const keepInputs = Array.isArray(config.keepInputs)
    ? config.keepInputs.filter((n): n is string => typeof n === 'string')
    : []
  // Models with operations, and the ones their visible relations reach
  const emittedModels = new Set<string>()
  const modelByName = new Map(dmmf.datamodel.models.map((m) => [m.name, m]))
  const pending = dmmf.datamodel.models.filter(
    (m) => !usesOperations || Object.keys(models[m.name]?.operations ?? {}).length,
  )
  while (pending.length) {
    const model = pending.pop() as DMMF.Model
    if (emittedModels.has(model.name)) continue
    emittedModels.add(model.name)
    for (const field of model.fields) {
      const target = modelByName.get(field.type)
      if (field.kind === 'object' && !models[model.name]?.fields[field.name]?.hidden && target) pending.push(target)
    }
  }
  if (!usesOperations) for (const model of dmmf.datamodel.models) emittedModels.add(model.name)

  return { models, manifestPath: manifest, keepInputs, usesOperations, emittedModels, warnings }
}

/** Resolves and validates the raw `crud.exposure`. Without it there is nothing to resolve: `undefined` */
export const normalizeExposure = (raw: unknown, dmmf: DMMF.Document): NormalizedExposure | undefined => {
  if (raw === undefined) return undefined
  const problems = collectExposureProblems(raw, dmmf)
  if (problems.length) throw new Error(`Invalid pothos-codegen configuration:\n - ${problems.join('\n - ')}`)
  return buildExposure(raw, dmmf)
}
