import type { ExposureRuntime, Guard, OperationTarget } from './types'

/**
 * Builds `guards` from the tags of the config: `(target) => target.tags.flatMap(tag => factories[tag](target))`.
 * A factory returns a guard or a list of them. A tag without factory throws, so a typo fails at startup.
 */
export const byTag =
  (factories: Record<string, (target: OperationTarget) => Guard | Guard[]>): NonNullable<ExposureRuntime['guards']> =>
  (target) =>
    target.tags.flatMap((tag) => {
      const factory = Object.keys(factories).includes(tag) ? factories[tag] : undefined
      if (!factory) throw new Error(`Tag "${tag}" used by ${target.model}.${target.operation} has no guard`)
      const guards = factory(target)
      return Array.isArray(guards) ? guards : [guards]
    })
