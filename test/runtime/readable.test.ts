import { isRowReadable } from '../../src/runtime/readable'
import { configureExposure, resetExposureForTests } from '../../src/runtime/registry'
import type { RelationTarget, Where } from '../../src/runtime/types'

beforeEach(() => resetExposureForTests())

const target: RelationTarget = { kind: 'relation', model: 'Post', field: 'author', targetModel: 'User', isList: false }

const finderOver = (rows: { id: number }[]) => {
  const calls: Where[] = []
  return {
    calls,
    finder: {
      key: 'id',
      find: async (where: Where) => {
        calls.push(where)
        const ids = ((where.AND as any[])[0].id as { in: number[] }).in
        return rows.filter((row) => ids.includes(row.id))
      },
    },
  }
}

describe('isRowReadable', () => {
  it('without restrictions every row is readable and nothing is queried', () => {
    configureExposure({ scope: () => undefined })
    const { finder, calls } = finderOver([])
    expect(isRowReadable(target, { id: 1 }, {}, finder)).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('a row that scope includes is readable', async () => {
    configureExposure({ scope: () => ({ ok: true }) })
    const { finder, calls } = finderOver([{ id: 1 }])
    await expect(isRowReadable(target, { id: 1 }, {}, finder)).resolves.toBe(true)
    expect(calls).toEqual([{ AND: [{ id: { in: [1] } }, { ok: true }] }])
  })

  it('a row that scope leaves out is not readable', async () => {
    configureExposure({ scope: () => ({ ok: true }) })
    const { finder } = finderOver([{ id: 1 }])
    await expect(isRowReadable(target, { id: 2 }, {}, finder)).resolves.toBe(false)
  })

  it('a scope without permissions gives false for every row', async () => {
    configureExposure({ scope: () => ({ OR: [] }) })
    const finder = { key: 'id', find: async () => [] }
    const ctx = {}
    const results = await Promise.all([1, 2, 3].map((id) => isRowReadable(target, { id }, ctx, finder)))
    expect(results).toEqual([false, false, false])
  })

  it('rows asked for in the same tick are checked with a single query', async () => {
    configureExposure({ scope: () => ({ ok: true }) })
    const { finder, calls } = finderOver(
      Array.from({ length: 50 }, (_, i) => ({ id: i })).filter((r) => r.id % 2 === 0),
    )
    const ctx = {}
    const results = await Promise.all(Array.from({ length: 50 }, (_, id) => isRowReadable(target, { id }, ctx, finder)))
    expect(calls).toHaveLength(1)
    expect(results.filter(Boolean)).toHaveLength(25)
    expect(results[0]).toBe(true)
    expect(results[1]).toBe(false)
  })

  it('duplicated ids are asked once', async () => {
    configureExposure({ scope: () => ({ ok: true }) })
    const { finder, calls } = finderOver([{ id: 1 }])
    const ctx = {}
    await Promise.all([1, 1, 1].map((id) => isRowReadable(target, { id }, ctx, finder)))
    expect(((calls[0]?.AND as any[]) ?? [])[0].id.in).toEqual([1])
  })

  it('later ticks (nested levels) open new batches: one query per level', async () => {
    configureExposure({ scope: () => ({ ok: true }) })
    const { finder, calls } = finderOver([{ id: 1 }, { id: 2 }])
    const ctx = {}
    await Promise.all([1, 2].map((id) => isRowReadable(target, { id }, ctx, finder)))
    await Promise.all([1, 2].map((id) => isRowReadable(target, { id }, ctx, finder)))
    expect(calls).toHaveLength(2)
  })

  it('requests do not share batches', async () => {
    configureExposure({ scope: () => ({ ok: true }) })
    const { finder, calls } = finderOver([{ id: 1 }])
    await Promise.all([isRowReadable(target, { id: 1 }, {}, finder), isRowReadable(target, { id: 1 }, {}, finder)])
    expect(calls).toHaveLength(2)
  })

  it('an error of the finder rejects every row of the batch', async () => {
    configureExposure({ scope: () => ({ ok: true }) })
    const finder = { key: 'id', find: async () => Promise.reject(new Error('db down')) }
    const ctx = {}
    const results = await Promise.allSettled([1, 2].map((id) => isRowReadable(target, { id }, ctx, finder)))
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
  })

  it('works without an object context (no batching)', async () => {
    configureExposure({ scope: () => ({ ok: true }) })
    const { finder } = finderOver([{ id: 1 }])
    await expect(isRowReadable(target, { id: 1 }, undefined, finder)).resolves.toBe(true)
  })
})
