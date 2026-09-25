import { composeScope } from './compose'
import type { RelationTarget } from './types'

/** How the generated code reads rows of the target model: it knows the Prisma client, the runtime does not */
export type RowFinder = {
  /** Field of the target model the relation points to (`id`) */
  key: string
  /** `prisma.<model>.findMany({ where, select: { <key>: true } })` */
  find: (where: any) => Promise<Record<string, unknown>[]>
}

type Batch = { keys: Set<unknown>; readable?: Promise<Set<unknown>> }

// Per request: the rows asked for in the same tick are checked with a single query
const batches = new WeakMap<object, Map<string, Batch>>()

/**
 * Whether the row a guarded to-one relation points to is visible for the context, that is, whether `scope` includes
 * it. Prisma does not accept a `where` on a to-one relation, so the relation is loaded with its parent and each row
 * is checked afterwards; the rows of a list of parents are checked together, so the cost is one query per level
 * instead of one per parent.
 */
export const isRowReadable = (
  target: RelationTarget,
  row: Record<string, unknown>,
  ctx: unknown,
  finder: RowFinder,
): boolean | Promise<boolean> => {
  const scope = composeScope(target, ctx)
  if (!scope) return true

  const key = row[finder.key]
  const find = (keys: unknown[]) =>
    finder
      .find({ AND: [{ [finder.key]: { in: keys } }, scope] })
      .then((rows) => new Set(rows.map((r) => r[finder.key])))

  if (typeof ctx !== 'object' || ctx === null) return find([key]).then((readable) => readable.has(key))

  let perRequest = batches.get(ctx)
  if (!perRequest) {
    perRequest = new Map()
    batches.set(ctx, perRequest)
  }
  const batchKey = `${target.model}.${target.field}`

  let batch = perRequest.get(batchKey)
  if (!batch) {
    const created: Batch = { keys: new Set() }
    batch = created
    perRequest.set(batchKey, created)
    // Rows asked for while this tick runs join the batch; later ones open a new one
    created.readable = Promise.resolve().then(() => {
      perRequest?.delete(batchKey)
      return find([...created.keys])
    })
  }
  batch.keys.add(key)
  return (batch.readable as Promise<Set<unknown>>).then((readable) => readable.has(key))
}
