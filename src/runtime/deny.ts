import { ExposureError } from './errors'
import { getManifest } from './registry'
import type { ManifestField, Where } from './types'

const MAX_DEPTH = 500

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Scalar types Prisma filters with `in` (Boolean and Json do not have it) */
const SUPPORTS_IN = new Set(['Int', 'String', 'Float', 'BigInt', 'Decimal', 'DateTime', 'Bytes'])

const canUseIn = (field: ManifestField) =>
  field.kind === 'scalar' && !field.isList && field.type !== 'Boolean' && field.type !== 'Json'

/**
 * A `where` that matches no row of `model`, in ANY position (root, inside AND/NOT, in `some`/`every`/`none`).
 *
 * `{ OR: [] }` is not one: Prisma returns no rows for it at the root of a query, but it IGNORES it when it is an element
 * of an AND (`{ AND: [x, { OR: [] }] }` matches x), which would show rows a scope meant to hide. `{ <field>: { in: [] } }`
 * is false everywhere.
 */
export const matchNothing = (model: string): Where => {
  const fields = getManifest()?.models[model]?.fields ?? {}
  const entries = Object.entries(fields)
  // Prefer the fields that exist in every model that has an id; any scalar that supports `in` works
  const [name] = entries.find(([key, field]) => key === 'id' && canUseIn(field)) ??
    entries.find(([, field]) => canUseIn(field)) ?? ['id']
  return { [name]: { in: [] } }
}

const isEmptyOr = (node: Record<string, unknown>) => Array.isArray(node.OR) && node.OR.length === 0

/**
 * Replaces every `{ OR: [] }` of a `where` of `model` (also inside relation filters) by `matchNothing`. A node with an
 * empty OR can not match anything, whatever else it has, so the whole node is replaced. Returns the same object when there
 * was nothing to replace.
 */
export const denyEmptyOr = (model: string, node: unknown, depth = 0): unknown => {
  if (!isPlainObject(node)) return node
  if (depth > MAX_DEPTH) throw new ExposureError('FORBIDDEN', 'The scope is nested too deeply')
  if (isEmptyOr(node)) return matchNothing(model)

  const fields = getManifest()?.models[model]?.fields ?? {}
  let out: Record<string, unknown> | undefined
  const set = (key: string, value: unknown) => {
    if (value === node[key]) return
    out ??= { ...node }
    out[key] = value
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      set(
        key,
        Array.isArray(value)
          ? mapKeepingIdentity(value, (child) => denyEmptyOr(model, child, depth + 1))
          : denyEmptyOr(model, value, depth + 1),
      )
      continue
    }
    const field = fields[key]
    if (field?.kind !== 'relation' || !isPlainObject(value)) continue
    const target = field.targetModel
    const inner = (v: unknown) => denyEmptyOr(target, v, depth + 1)
    const isFilter = Object.keys(value).every((k) => ['some', 'every', 'none', 'is', 'isNot'].includes(k))
    if (!isFilter) {
      set(key, inner(value))
      continue
    }
    let relation: Record<string, unknown> | undefined
    for (const [op, filter] of Object.entries(value)) {
      const replaced = inner(filter)
      if (replaced !== filter) {
        relation ??= { ...value }
        relation[op] = replaced
      }
    }
    if (relation) set(key, relation)
  }
  return out ?? node
}

/** `map` that returns the same array when no element changed */
const mapKeepingIdentity = <T>(items: T[], fn: (item: T) => T): T[] => {
  let out: T[] | undefined
  items.forEach((item, i) => {
    const mapped = fn(item)
    if (mapped !== item) {
      out ??= [...items]
      out[i] = mapped
    }
  })
  return out ?? items
}
