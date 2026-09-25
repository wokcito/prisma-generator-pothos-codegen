import { byTag } from '../../src/runtime/byTag'
import { composeFieldAccess, composeFieldScope, composeScope } from '../../src/runtime/compose'
import { configureExposure, getGuards, registerManifest, resetExposureForTests } from '../../src/runtime/registry'
import { manifestOf, model, query, relation, scalar, setup } from './test-utils'

/** Post, User and Comment without guarded fields (so no fieldAccess is needed) */
const plainSetup = () =>
  setup(
    manifestOf({
      Post: model({
        id: scalar([], 'Int'),
        published: scalar([], 'Boolean'),
        author: relation('User', false),
        comments: relation('Comment', true),
      }),
      User: model({ id: scalar([], 'Int'), name: scalar() }),
      Comment: model({ id: scalar([], 'Int') }),
    }),
  )

import type { Guard, OperationTarget } from '../../src/runtime/types'

beforeEach(() => resetExposureForTests())

const target = query('Post', 'findMany', ['a', 'b'])

describe('byTag', () => {
  const guardA: Guard = () => {}
  const guardB: Guard = () => {}
  const guardC: Guard = () => {}

  it('returns guards in the order of target.tags', () => {
    const guards = byTag({ a: () => guardA, b: () => guardB })
    expect(guards(target)).toEqual([guardA, guardB])
    expect(guards({ ...target, tags: ['b', 'a'] })).toEqual([guardB, guardA])
  })

  it('a factory may return one guard or a list', () => {
    const guards = byTag({ a: () => guardA, b: () => [guardB, guardC] })
    expect(guards(target)).toEqual([guardA, guardB, guardC])
  })

  it('a tag without factory throws naming the tag and the operation', () => {
    expect(() => byTag({ a: () => guardA })(target)).toThrow('Tag "b" used by Post.findMany has no guard')
  })

  it('does not resolve tags through the prototype', () => {
    expect(() => byTag({})({ ...target, tags: ['toString'] })).toThrow(
      'Tag "toString" used by Post.findMany has no guard',
    )
  })

  it('the factory receives the whole target', () => {
    let received: OperationTarget | undefined
    byTag({
      a: (t) => {
        received = t
        return guardA
      },
      b: () => guardB,
    })(target)
    expect(received).toBe(target)
  })

  it('the factories run once per operation when the setup is validated, not per request', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: ['a'] }) }))
    let calls = 0
    configureExposure({ guards: byTag({ a: () => (calls++, guardA) }) })
    const t = query('Post', 'findMany', ['a'])
    for (let i = 0; i < 20; i++) getGuards(t)
    expect(calls).toBe(1)
  })

  it('an operation without tags has no guards', () => {
    expect(byTag({})(query('Post', 'findMany'))).toEqual([])
  })
})

describe('scope composition', () => {
  const post = query('Post', 'findMany')

  it('one function', () => {
    configureExposure({ scope: () => ({ published: true }) })
    expect(composeScope(post, {})).toEqual({ published: true })
  })

  it('a list is combined with AND', () => {
    configureExposure({ scope: [() => ({ a: 1 }), () => ({ b: 2 })] })
    expect(composeScope(post, {})).toEqual({ AND: [{ a: 1 }, { b: 2 }] })
  })

  it('undefined is neutral', () => {
    configureExposure({ scope: [() => undefined, () => ({ b: 2 }), () => undefined] })
    expect(composeScope(post, {})).toEqual({ b: 2 })
    configureExposure({ scope: () => undefined })
    expect(composeScope(post, {})).toBeUndefined()
    configureExposure({})
    expect(composeScope(post, {})).toBeUndefined()
  })

  it('{ OR: [] } means no rows and dominates, in a form that is false in every position', () => {
    plainSetup()
    configureExposure({ scope: [() => ({ a: 1 }), () => ({ OR: [] })] })
    // `{ OR: [] }` itself is IGNORED by Prisma when it is an element of an AND: it becomes a where that is false everywhere
    expect(composeScope(post, {})).toEqual({ AND: [{ a: 1 }, { id: { in: [] } }] })
    configureExposure({ scope: () => ({ OR: [] }) })
    expect(composeScope(post, {})).toEqual({ id: { in: [] } })
  })

  it('an empty OR nested anywhere in the scope is made false, also inside relation filters', () => {
    plainSetup()
    configureExposure({
      scope: () => ({
        AND: [{ published: true }, { OR: [] }],
        NOT: { OR: [] },
        author: { is: { OR: [] } },
        comments: { some: { OR: [] } },
      }),
    })
    expect(composeScope(post, {})).toEqual({
      AND: [{ published: true }, { id: { in: [] } }],
      NOT: { id: { in: [] } },
      author: { is: { id: { in: [] } } },
      comments: { some: { id: { in: [] } } },
    })
  })

  it('a scope without an empty OR is returned as it is (same object)', () => {
    plainSetup()
    const where = { AND: [{ published: true }], author: { is: { name: 'a' } } }
    configureExposure({ scope: () => where })
    expect(composeScope(post, {})).toBe(where)
  })

  it('receives a RelationTarget for relations and the context', () => {
    const seen: unknown[] = []
    configureExposure({ scope: (t, ctx) => (seen.push(t, ctx), undefined) })
    const relationTarget = {
      kind: 'relation',
      model: 'User',
      field: 'posts',
      targetModel: 'Post',
      isList: true,
    } as const
    composeScope(relationTarget, 'ctx')
    expect(seen).toEqual([relationTarget, 'ctx'])
  })

  it('a result that is not a where object throws instead of failing open', () => {
    configureExposure({ scope: () => null as never })
    expect(() => composeScope(post, {})).toThrow(/scope must return a Prisma where object or undefined, got null/)
    configureExposure({ scope: () => false as never })
    expect(() => composeScope(post, {})).toThrow(/got boolean/)
  })
})

describe('fieldAccess composition', () => {
  const field = { model: 'User', field: 'email' }

  it('every function must return true', () => {
    configureExposure({ fieldAccess: [() => true, () => true] })
    expect(composeFieldAccess(field, {}, {})).toBe(true)
    configureExposure({ fieldAccess: [() => true, () => false] })
    expect(composeFieldAccess(field, {}, {})).toBe(false)
  })

  it('undefined denies', () => {
    configureExposure({ fieldAccess: () => undefined as never })
    expect(composeFieldAccess(field, {}, {})).toBe(false)
  })

  it.each([1, 'yes', {}, [], null])('%j denies', (value) => {
    configureExposure({ fieldAccess: () => value as never })
    expect(composeFieldAccess(field, {}, {})).toBe(false)
  })

  it('a function that throws propagates and does not allow', () => {
    configureExposure({
      fieldAccess: () => {
        throw new Error('boom')
      },
    })
    expect(() => composeFieldAccess(field, {}, {})).toThrow('boom')
  })

  it('without fieldAccess it denies', () => {
    configureExposure({})
    expect(composeFieldAccess(field, {}, {})).toBe(false)
  })
})

describe('fieldScope composition', () => {
  it('AND of every function, undefined is neutral', () => {
    configureExposure({ fieldScope: [() => ({ id: 1 }), () => undefined, () => ({ ok: true })] })
    expect(composeFieldScope({ model: 'User', field: 'email' }, {})).toEqual({ AND: [{ id: 1 }, { ok: true }] })
  })
})
