import { ExposureError } from './errors'
import { getState, toArray } from './state'
import type {
  ExposureManifest,
  ExposureRuntime,
  Guard,
  ManifestField,
  ManifestRelationField,
  Operation,
  OperationTarget,
} from './types'

const isGuarded = (field: ManifestField) => field.states.includes('guarded')
const isToOne = (field: ManifestField): field is ManifestRelationField => field.kind === 'relation' && !field.isList

const targetOf = (model: string, operation: Operation, tags: readonly string[]): OperationTarget => ({
  kind: operation.startsWith('find') || operation === 'count' ? 'query' : 'mutation',
  model,
  operation,
  tags,
})

const operationsOf = (manifest: ExposureManifest) =>
  Object.entries(manifest.models).flatMap(([model, { operations }]) =>
    (Object.entries(operations) as [Operation, string[]][]).map(([operation, tags]) => ({ model, operation, tags })),
  )

/** Whether the schema needs a runtime at all: tags to guard or `guarded` fields */
export const manifestNeedsRuntime = (manifest: ExposureManifest): boolean =>
  operationsOf(manifest).some(({ tags }) => tags.length > 0) ||
  Object.values(manifest.models).some(({ fields }) => Object.values(fields).some(isGuarded))

/** Every problem of the pair (manifest, runtime), so a startup failure lists them all */
const findProblems = (
  manifest: ExposureManifest,
  runtime: ExposureRuntime | undefined,
  guards: Map<string, Guard[]>,
) => {
  const problems: string[] = []
  const operations = operationsOf(manifest)
  const guardedFields = Object.entries(manifest.models).flatMap(([model, { fields }]) =>
    Object.entries(fields)
      .filter(([, field]) => isGuarded(field))
      .map(([name, field]) => ({ model, name, field })),
  )

  for (const { model, operation, tags } of operations) {
    if (runtime?.guards) {
      try {
        guards.set(`${model}.${operation}`, runtime.guards(targetOf(model, operation, tags)))
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
      }
    } else if (tags.length > 0) {
      problems.push(
        `${model}.${operation} has tags [${tags.join(', ')}] but no guards are configured. Pass guards: byTag({...}) to configureExposure`,
      )
    }
  }

  const scalars = guardedFields.filter(({ field }) => field.kind === 'scalar')
  for (const { model, name } of scalars) {
    if (!toArray(runtime?.fieldAccess).length)
      problems.push(
        `${model}.${name} is guarded but no fieldAccess is configured. Pass fieldAccess to configureExposure`,
      )
  }
  if (scalars.length && toArray(runtime?.fieldAccess).length && !toArray(runtime?.fieldScope).length)
    problems.push(
      `fieldAccess is configured but fieldScope is not: filtering, ordering or paginating by a guarded field (${scalars
        .map(({ model, name }) => `${model}.${name}`)
        .join(', ')}) could not be protected. Pass fieldScope to configureExposure`,
    )
  for (const { model, name, field } of guardedFields) {
    if (isToOne(field) && !toArray(runtime?.scope).length)
      problems.push(
        `${model}.${name} is a guarded to-one relation but no scope is configured: it returns null for the rows of ${field.targetModel} that scope hides. Pass scope to configureExposure`,
      )
  }

  if (toArray(runtime?.scope).length) {
    for (const { model } of operations.filter(({ operation }) => operation === 'upsertOne'))
      problems.push(
        `upsertOne on model ${model} cannot be scoped: its create branch has no where. Remove it from operations`,
      )
  }

  return problems
}

const validate = () => {
  const state = getState()
  state.guards = new Map()
  if (!state.manifest) return
  const problems = findProblems(state.manifest, state.runtime, state.guards)
  if (problems.length) {
    state.guards = new Map()
    throw new Error(`Invalid exposure setup:\n - ${problems.join('\n - ')}`)
  }
}

/** Called by the generated `exposure.ts` when it is imported */
export const registerManifest = (manifest: ExposureManifest): void => {
  if (!manifest || manifest.version !== 1)
    throw new Error(`Unsupported exposure manifest version ${String((manifest as { version?: unknown })?.version)}`)
  getState().manifest = manifest
  // The order does not matter: it is validated once it has both the manifest and the runtime
  if (getState().runtime) validate()
}

/** Called by the application. Calling it again replaces the previous configuration */
export const configureExposure = (runtime: ExposureRuntime): void => {
  getState().runtime = runtime
  getState().guards = new Map()
  if (getState().manifest) validate()
}

/** Throws when the schema needs a runtime (tags or guarded fields) that was never configured. Call it before `listen` */
export const assertExposureConfigured = (): void => {
  const { manifest, runtime } = getState()
  if (!manifest) throw new Error('The exposure manifest is not registered: import the generated exposure.ts')
  if (!runtime && manifestNeedsRuntime(manifest))
    throw new Error(
      'The generated schema uses tags or guarded fields but configureExposure was not called. Call it before serving requests',
    )
}

/** Clears the manifest and the runtime */
export const resetExposureForTests = (): void => {
  const state = getState()
  state.manifest = undefined
  state.runtime = undefined
  state.guards = new Map()
}

export const getManifest = (): ExposureManifest | undefined => getState().manifest

/** Guards of an operation, computed once. With tags and no `guards` it fails closed */
export const getGuards = (target: OperationTarget): Guard[] => {
  const state = getState()
  const key = `${target.model}.${target.operation}`
  const cached = state.guards.get(key)
  if (cached) return cached

  if (!state.runtime?.guards) {
    if (target.tags.length > 0)
      throw new ExposureError(
        'INTERNAL',
        `${key} has tags [${target.tags.join(', ')}] but exposure is not configured: refusing to run it without its guards`,
      )
    return []
  }

  const guards = state.runtime.guards(target)
  state.guards.set(key, guards)
  return guards
}
