import { composeFieldAccess } from './compose'
import type { FieldTarget } from './types'

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null

// Per request (the context) and per loaded row (the object), never by the values of the row
const cache = new WeakMap<object, WeakMap<object, Map<string, boolean>>>()

/**
 * Whether the `guarded` field of a loaded row can be read: `fieldAccess` decides, and it is evaluated once per
 * request, row and field. Without a runtime (or without `fieldAccess`) it is `false`: it fails closed.
 */
export const canReadField = (target: FieldTarget, parent: unknown, ctx: unknown): boolean => {
  if (parent == null) return false
  // A partial selection that did not load the column can not return it
  if (isObject(parent) && target.field !== null && !(target.field in parent)) return false

  const memoize = isObject(ctx) && isObject(parent)
  const key = `${target.model}.${target.field ?? ''}`
  if (memoize) {
    const cached = cache.get(ctx)?.get(parent)?.get(key)
    if (cached !== undefined) return cached
  }

  const allowed = composeFieldAccess(target, parent, ctx)

  if (memoize) {
    let rows = cache.get(ctx)
    if (!rows) {
      rows = new WeakMap()
      cache.set(ctx, rows)
    }
    let fields = rows.get(parent)
    if (!fields) {
      fields = new Map()
      rows.set(parent, fields)
    }
    fields.set(key, allowed)
  }
  return allowed
}
