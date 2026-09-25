import { getGuards } from './registry'
import type { OperationTarget } from './types'

/**
 * Wraps the resolver of a generated operation: the guards of the operation run first, in order, and the resolver is
 * only called if all of them pass. A guard that throws stops it and its error is propagated as is.
 *
 * `flat` tells the resolver signature: `(root, args, ctx, info)` for plain fields (`count`, `updateMany`, `deleteMany`)
 * and `(query, root, args, ctx, info)` for `prismaField`.
 */
export const withExposure = <R extends (...args: any[]) => any>(
  target: OperationTarget,
  resolve: R,
  { flat }: { flat: boolean },
): R => {
  const offset = flat ? 0 : 1

  const wrapped = (...args: unknown[]) => {
    const guards = getGuards(target)
    if (guards.length === 0) return resolve(...args)

    const [root, fieldArgs, ctx, info] = args.slice(offset)
    return (async () => {
      for (const guard of guards) await guard(root, fieldArgs, ctx, info)
      return resolve(...args)
    })()
  }

  // Same arity as the wrapped resolver
  Object.defineProperty(wrapped, 'length', { value: resolve.length, configurable: true })
  return wrapped as unknown as R
}
