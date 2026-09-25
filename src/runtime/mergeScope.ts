import { composeFieldScope, composeScope, hasFieldScope } from './compose'
import { ExposureError } from './errors'
import { getManifest } from './registry'
import type { ManifestField, ManifestModel, OperationTarget, RelationTarget, Where } from './types'

const MAX_DEPTH = 500
const LOGICAL = ['AND', 'OR', 'NOT'] as const
const UNIQUE_OPERATIONS = ['findUnique', 'updateOne', 'deleteOne']

type Ctx = { ctx: unknown }
type Rewritten = { where: unknown; hoisted: Where[] }

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPresent = <T>(value: T | null | undefined): value is T => value != null

const modelOf = (model: string): ManifestModel => {
  const manifest = getManifest()
  if (!manifest)
    throw new ExposureError('INTERNAL', 'The exposure manifest is not registered: import the generated exposure.ts')
  const found = manifest.models[model]
  if (!found)
    throw new ExposureError('INTERNAL', `Model "${model}" is not in the exposure manifest. Regenerate the code`)
  return found
}

const isGuarded = (field: ManifestField) => field.states.includes('guarded')

const relationTarget = (
  model: string,
  field: string,
  relation: Extract<ManifestField, { kind: 'relation' }>,
): RelationTarget => ({
  kind: 'relation',
  model,
  field,
  targetModel: relation.targetModel,
  isList: relation.isList,
})

/** `where` of the rows where the guarded scalar is readable. Rejects when nothing can protect the filter */
const fieldScopeOf = (model: string, field: string, { ctx }: Ctx): Where | undefined => {
  if (!hasFieldScope())
    throw new ExposureError(
      'FORBIDDEN',
      `Cannot filter, order or paginate by "${model}.${field}": it is guarded and no fieldScope is configured`,
    )
  return composeFieldScope({ model, field }, ctx)
}

/**
 * Rewrites a `where` of `model`. Returns new structures where something changed (the arguments of the client are never
 * mutated) and the `fieldScope`s of the guarded scalars used anywhere in it (also inside AND/OR/NOT), which the caller
 * applies with an AND at the root of the `where` of this model (conservative: it can hide rows the client would see
 * with an OR, but it never leaks).
 */
const rewriteWhere = (model: string, node: unknown, cx: Ctx, depth: number): Rewritten => {
  if (!isPlainObject(node)) return { where: node, hoisted: [] }
  if (depth > MAX_DEPTH) throw new ExposureError('FORBIDDEN', 'The filter is nested too deeply')

  const { fields } = modelOf(model)
  const hoisted: Where[] = []
  const extra: unknown[] = []
  let changed = false
  const out: Record<string, unknown> = {}

  const hoist = (field: string) => {
    const scope = fieldScopeOf(model, field, cx)
    if (scope) hoisted.push(scope)
  }

  for (const [key, value] of Object.entries(node)) {
    if ((LOGICAL as readonly string[]).includes(key)) {
      if (Array.isArray(value)) {
        const children = value.map((child) => rewriteWhere(model, child, cx, depth + 1))
        for (const child of children) hoisted.push(...child.hoisted)
        const rewritten = children.map((child) => child.where)
        if (rewritten.some((child, i) => child !== value[i])) changed = true
        out[key] = rewritten
      } else {
        const child = rewriteWhere(model, value, cx, depth + 1)
        hoisted.push(...child.hoisted)
        if (child.where !== value) changed = true
        out[key] = child.where
      }
      continue
    }

    const field = fields[key]
    if (!field) {
      // A compound unique (`userId_token: { userId, token }`): its keys are fields of this same model
      if (isPlainObject(value)) {
        const child = rewriteWhere(model, value, cx, depth + 1)
        hoisted.push(...child.hoisted)
        if (child.where !== value) changed = true
        out[key] = child.where
        continue
      }
      throw new ExposureError(
        'INTERNAL',
        `Field "${key}" of model "${model}" is not in the exposure manifest. Regenerate the code`,
      )
    }

    if (field.kind === 'scalar') {
      if (isGuarded(field)) hoist(key)
      out[key] = value
      continue
    }

    const relation = rewriteRelation(model, key, field, value, cx, depth)
    hoisted.push(...relation.hoisted)
    if (relation.extra.length) extra.push(...relation.extra)
    if (relation.keep) out[key] = relation.value
    if (relation.keep ? relation.value !== value : true) changed = true
  }

  if (extra.length) {
    const existing = out.AND === undefined ? [] : Array.isArray(out.AND) ? out.AND : [out.AND]
    out.AND = [...existing, ...extra]
  }
  return { where: changed ? out : node, hoisted }
}

/** `W` of a relation, with the `fieldScope`s of its own model applied inside it */
const rewriteBoundary = (model: string, node: unknown, cx: Ctx, depth: number): unknown => {
  const { where, hoisted } = rewriteWhere(model, node, cx, depth + 1)
  if (hoisted.length === 0) return where
  return { AND: [where, ...hoisted] }
}

type RelationResult = { keep: boolean; value: unknown; hoisted: Where[]; extra: unknown[] }

const rewriteRelation = (
  model: string,
  key: string,
  field: Extract<ManifestField, { kind: 'relation' }>,
  value: unknown,
  cx: Ctx,
  depth: number,
): RelationResult => {
  const target = field.targetModel
  const scopeT = composeScope(relationTarget(model, key, field), cx.ctx)
  const inner = (node: unknown) => rewriteBoundary(target, node, cx, depth)
  const visible = (node: unknown) => (scopeT ? { AND: [node, scopeT].filter(isPresent) } : node)
  const unchanged = { keep: true, value, hoisted: [] as Where[], extra: [] as unknown[] }

  if (field.isList) {
    if (!isPlainObject(value)) return unchanged
    const rewritten: Record<string, unknown> = { ...value }
    let changed = false
    for (const op of ['some', 'none', 'every'] as const) {
      if (!isPlainObject(value[op])) continue
      const w = inner(value[op])
      rewritten[op] = op === 'every' ? (scopeT ? { OR: [{ NOT: scopeT }, w] } : w) : visible(w)
      if (rewritten[op] !== value[op]) changed = true
    }
    return changed ? { ...unchanged, value: rewritten } : unchanged
  }

  // To-one: `{ is, isNot }`, a direct where, or `null`. A row that scope hides behaves as if it did not exist
  const isFilter =
    isPlainObject(value) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every((k) => k === 'is' || k === 'isNot') &&
    !('is' in modelOf(target).fields) &&
    !('isNot' in modelOf(target).fields)

  const noRelated = () => ({ keep: false, value: undefined, hoisted: [], extra: [{ NOT: { [key]: { is: scopeT } } }] })

  if (value === null) return scopeT ? noRelated() : unchanged
  if (!isPlainObject(value)) return unchanged

  if (!isFilter) {
    const w = inner(value)
    const result = scopeT ? { is: visible(w) } : w
    return result === value ? unchanged : { ...unchanged, value: result }
  }

  const extra: unknown[] = []
  const rewritten: Record<string, unknown> = {}
  let changed = false
  for (const op of ['is', 'isNot'] as const) {
    if (!(op in value)) continue
    const filter = value[op]
    if (filter === null || filter === undefined) {
      if (!scopeT || filter === undefined) rewritten[op] = filter
      else {
        // `is: null` means "no visible related row", `isNot: null` "a visible related row"
        extra.push(op === 'is' ? { NOT: { [key]: { is: scopeT } } } : { [key]: { is: scopeT } })
        changed = true
      }
      continue
    }
    rewritten[op] = visible(inner(filter))
    if (rewritten[op] !== filter) changed = true
  }
  if (!changed) return unchanged
  return { keep: Object.keys(rewritten).length > 0, value: rewritten, hoisted: [], extra }
}

/** Ordering through a relation reveals data of rows that may be invisible: rejected when the target is restricted */
const checkRelationOrderBy = (
  model: string,
  key: string,
  field: Extract<ManifestField, { kind: 'relation' }>,
  value: unknown,
  cx: Ctx,
  depth: number,
) => {
  if (depth > MAX_DEPTH) throw new ExposureError('FORBIDDEN', 'The ordering is nested too deeply')
  if (composeScope(relationTarget(model, key, field), cx.ctx) !== undefined)
    throw new ExposureError(
      'FORBIDDEN',
      `Cannot order by "${model}.${key}": rows of ${field.targetModel} are restricted`,
    )

  if (!isPlainObject(value)) return
  const { fields } = modelOf(field.targetModel)
  for (const [name, nested] of Object.entries(value)) {
    const nestedField = fields[name]
    if (!nestedField) continue // `_count`
    if (nestedField.kind === 'relation')
      checkRelationOrderBy(field.targetModel, name, nestedField, nested, cx, depth + 1)
    else if (isGuarded(nestedField) && fieldScopeOf(field.targetModel, name, cx) !== undefined)
      throw new ExposureError('FORBIDDEN', `Cannot order by "${field.targetModel}.${name}": it is guarded`)
  }
}

const hoistOrderBy = (model: string, orderBy: unknown, cx: Ctx): Where[] => {
  const hoisted: Where[] = []
  const { fields } = modelOf(model)
  for (const item of Array.isArray(orderBy) ? orderBy : [orderBy]) {
    if (!isPlainObject(item)) continue
    for (const [key, value] of Object.entries(item)) {
      if (key === '_relevance' && isPlainObject(value)) {
        for (const name of Array.isArray(value.fields) ? value.fields : [value.fields]) {
          const relevant = typeof name === 'string' ? fields[name] : undefined
          if (relevant && isGuarded(relevant)) hoistScope(hoisted, model, name as string, cx)
        }
        continue
      }
      const field = fields[key]
      if (!field) continue // `_count`, ...
      if (field.kind === 'relation') checkRelationOrderBy(model, key, field, value, cx, 0)
      else if (isGuarded(field)) hoistScope(hoisted, model, key, cx)
    }
  }
  return hoisted
}

const hoistScope = (hoisted: Where[], model: string, field: string, cx: Ctx) => {
  const scope = fieldScopeOf(model, field, cx)
  if (scope) hoisted.push(scope)
}

/** Fields of a `cursor` (unique keys, possibly compound) and of `distinct` */
const hoistFields = (model: string, node: unknown, cx: Ctx): Where[] => {
  const hoisted: Where[] = []
  const { fields } = modelOf(model)
  const visit = (name: string, value: unknown) => {
    const field = fields[name]
    if (field?.kind === 'scalar' && isGuarded(field)) hoistScope(hoisted, model, name, cx)
    else if (!field && isPlainObject(value)) for (const [inner, v] of Object.entries(value)) visit(inner, v)
  }
  if (isPlainObject(node)) for (const [name, value] of Object.entries(node)) visit(name, value)
  else for (const name of Array.isArray(node) ? node : [node]) if (typeof name === 'string') visit(name, undefined)
  return hoisted
}

/**
 * Builds the `where` the generated resolver passes to Prisma: the client `where`, rewritten so guarded and hidden-by-scope
 * data can not be probed through it, plus the `scope` of the operation (or of the relation). `orderBy`, `cursor` and
 * `distinct` are only inspected: they are passed to Prisma unchanged.
 *
 * Lists (and list relations) get `{ AND: [where, ...fieldScopes, scope] }`. Unique operations keep the unique key at the
 * top level and add the rest under `AND`.
 */
export const mergeScope = (
  target: OperationTarget | RelationTarget,
  args: { where?: unknown; orderBy?: unknown; cursor?: unknown; distinct?: unknown } | null | undefined,
  ctx: unknown,
): any => {
  const model = target.kind === 'relation' ? target.targetModel : target.model
  const cx: Ctx = { ctx }
  const scope = composeScope(target, ctx)
  const original = args?.where ?? undefined

  const { where, hoisted } = rewriteWhere(model, original, cx, 0)
  hoisted.push(...hoistOrderBy(model, args?.orderBy, cx))
  if (args?.cursor != null) hoisted.push(...hoistFields(model, args.cursor, cx))
  if (args?.distinct != null) hoisted.push(...hoistFields(model, args.distinct, cx))

  const unique = target.kind !== 'relation' && UNIQUE_OPERATIONS.includes(target.operation)
  if (unique) {
    if (!isPlainObject(where)) return where
    if (where === original && hoisted.length === 0 && !scope) return original
    const current = (where as { AND?: unknown }).AND
    const conjuncts = [current ?? [], ...hoisted, scope].flat().filter(isPresent)
    return conjuncts.length ? { ...where, AND: conjuncts } : where
  }

  const parts = [where, ...hoisted, scope].filter(isPresent)
  if (parts.length === 0) return undefined
  if (parts.length === 1 && parts[0] === original) return original
  return { AND: parts }
}
