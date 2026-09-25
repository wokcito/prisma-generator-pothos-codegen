import { byTag } from '../../src/runtime/byTag'
import { configureExposure, registerManifest, resetExposureForTests } from '../../src/runtime/registry'
import type { Guard } from '../../src/runtime/types'
import { withExposure } from '../../src/runtime/withExposure'
import { manifestOf, model, query, scalar } from './test-utils'

beforeEach(() => resetExposureForTests())

const target = query('Post', 'findMany', ['a', 'b'])

const configure = (guards: Record<string, Guard>) => {
  registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: ['a', 'b'] }) }))
  configureExposure({ guards: byTag(Object.fromEntries(Object.entries(guards).map(([tag, g]) => [tag, () => g]))) })
}

describe('withExposure', () => {
  it('prismaField: the guard gets (root, args, ctx, info) without the query', async () => {
    const seen: unknown[][] = []
    configure({ a: (...args) => void seen.push(args), b: () => {} })
    const resolve = vi.fn(async () => 'rows')
    const wrapped = withExposure(target, resolve as any, { flat: false })
    await wrapped('query', 'root', { take: 1 }, 'ctx', 'info')
    expect(seen).toEqual([['root', { take: 1 }, 'ctx', 'info']])
    expect(resolve).toHaveBeenCalledWith('query', 'root', { take: 1 }, 'ctx', 'info')
  })

  it('flat: (root, args, ctx, info)', async () => {
    const seen: unknown[][] = []
    configure({ a: (...args) => void seen.push(args), b: () => {} })
    const resolve = vi.fn(async () => 3)
    const wrapped = withExposure(target, resolve as any, { flat: true })
    await expect(wrapped('root', { where: {} }, 'ctx', 'info')).resolves.toBe(3)
    expect(seen).toEqual([['root', { where: {} }, 'ctx', 'info']])
  })

  it('keeps the arity', () => {
    configure({ a: () => {}, b: () => {} })
    const resolve = async (_query: unknown, _root: unknown, _args: unknown, _ctx: unknown, _info: unknown) => 1
    expect(withExposure(target, resolve, { flat: false }).length).toBe(5)
    expect(withExposure(target, async (_r: unknown, _a: unknown) => 1, { flat: true }).length).toBe(2)
  })

  it('the guards run in order and the first that throws stops the rest', async () => {
    const order: string[] = []
    configure({
      a: () => {
        order.push('a')
        throw new Error('nope')
      },
      b: () => void order.push('b'),
    })
    const wrapped = withExposure(target, (async () => 1) as any, { flat: true })
    await expect(wrapped('r', {}, {}, {})).rejects.toThrow('nope')
    expect(order).toEqual(['a'])
  })

  it('the resolver is not called when a guard throws', async () => {
    configure({
      a: () => {
        throw new Error('nope')
      },
      b: () => {},
    })
    const resolve = vi.fn()
    await expect(withExposure(target, resolve as any, { flat: true })('r', {}, {}, {})).rejects.toThrow()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('async guards are awaited in order', async () => {
    const order: string[] = []
    configure({
      a: async () => {
        await new Promise((r) => setTimeout(r, 10))
        order.push('a')
      },
      b: () => void order.push('b'),
    })
    const resolve = vi.fn(async () => order.push('resolve'))
    await withExposure(target, resolve as any, { flat: true })('r', {}, {}, {})
    expect(order).toEqual(['a', 'b', 'resolve'])
  })

  it('the error of the guard arrives as is', async () => {
    const error = Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' })
    configure({
      a: () => {
        throw error
      },
      b: () => {},
    })
    await expect(withExposure(target, (async () => 1) as any, { flat: true })('r', {}, {}, {})).rejects.toBe(error)
  })

  it('without tags the resolver is called directly', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: [] }) }))
    configureExposure({ guards: byTag({}) })
    const resolve = vi.fn(() => 'sync')
    expect(withExposure(query('Post', 'findMany'), resolve as any, { flat: true })('r', {}, {}, {})).toBe('sync')
  })

  it('fails closed: tags without a configured runtime never run the resolver', () => {
    const resolve = vi.fn()
    const wrapped = withExposure(target, resolve as any, { flat: true })
    expect(() => wrapped('r', {}, {}, {})).toThrow(/refusing to run it without its guards/)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('without tags and without runtime it just runs', async () => {
    const resolve = vi.fn(async () => 'ok')
    await expect(withExposure(query('Post', 'count'), resolve as any, { flat: true })('r', {}, {}, {})).resolves.toBe(
      'ok',
    )
  })
})
