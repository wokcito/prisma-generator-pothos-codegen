import { denyEmptyOr } from './deny'
import { ExposureError } from './errors'
import { getState, toArray } from './state'
import type { FieldTarget, OperationTarget, RelationTarget, Where } from './types'

/**
 * A `where` (or nothing): anything else is a bug of the function, and using it as "no restriction" would fail open.
 * `{ OR: [] }` ("no rows") is made safe to nest: see `matchNothing`.
 */
const asWhere = (value: unknown, source: string, model: string): Where | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ExposureError(
      'INTERNAL',
      `${source} must return a Prisma where object or undefined, got ${value === null ? 'null' : typeof value}`,
    )
  return denyEmptyOr(model, value) as Where
}

/** AND of the results; `undefined` does not restrict. `{ OR: [] }` (no rows) dominates by itself inside the AND */
const andAll = (parts: Where[]): Where | undefined => {
  if (parts.length === 0) return undefined
  if (parts.length === 1) return parts[0]
  return { AND: parts }
}

/** Rows visible for the context in an operation or a relation, or `undefined` when nothing restricts them */
export const composeScope = (target: OperationTarget | RelationTarget, ctx: unknown): Where | undefined => {
  const parts: Where[] = []
  for (const fn of toArray(getState().runtime?.scope)) {
    const where = asWhere(fn(target, ctx), 'scope', target.kind === 'relation' ? target.targetModel : target.model)
    if (where) parts.push(where)
  }
  return andAll(parts)
}

/** True when a `fieldScope` is configured (there is something to combine, even if every function returns `undefined`) */
export const hasFieldScope = (): boolean => toArray(getState().runtime?.fieldScope).length > 0

/** Rows where a `guarded` field is readable, or `undefined` when nothing restricts them */
export const composeFieldScope = (target: { model: string; field: string }, ctx: unknown): Where | undefined => {
  const parts: Where[] = []
  for (const fn of toArray(getState().runtime?.fieldScope)) {
    const where = asWhere(fn(target, ctx), 'fieldScope', target.model)
    if (where) parts.push(where)
  }
  return andAll(parts)
}

/** A field is readable only if EVERY function returns exactly `true`. A function that throws propagates its error */
export const composeFieldAccess = (target: FieldTarget, parent: unknown, ctx: unknown): boolean => {
  const fns = toArray(getState().runtime?.fieldAccess)
  if (fns.length === 0) return false
  for (const fn of fns) if (fn(target, parent, ctx) !== true) return false
  return true
}
