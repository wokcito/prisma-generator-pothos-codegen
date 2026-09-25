import { ExposureError } from '../../src/runtime/errors'
import { mergeScope } from '../../src/runtime/mergeScope'
import { configureExposure, resetExposureForTests } from '../../src/runtime/registry'
import { getState } from '../../src/runtime/state'
import type { ExposureRuntime, RelationTarget, Where } from '../../src/runtime/types'
import { blogManifest, manifestOf, model, query, relation, scalar, setup } from './test-utils'

beforeEach(() => resetExposureForTests())

const findMany = query('Post', 'findMany')
const findUnique = query('Post', 'findUnique')
const users = query('User', 'findMany')

/** scope per model, fieldScope per model.field */
const configure = (
  scopes: Record<string, Where | undefined> = {},
  fieldScopes: Record<string, Where | undefined> | false = {},
) => {
  const runtime = {
    scope: (t: Parameters<NonNullable<ExposureRuntime['scope']> & ((...a: any[]) => unknown)>[0]) =>
      scopes[t.kind === 'relation' ? t.targetModel : t.model],
    fieldAccess: () => true,
    ...(fieldScopes === false
      ? {}
      : { fieldScope: (t: { model: string; field: string }) => fieldScopes[`${t.model}.${t.field}`] }),
  } as ExposureRuntime
  // A setup without fieldScope is rejected at startup: install it directly to test the request-time rejection
  if (fieldScopes === false) getState().runtime = runtime
  else configureExposure(runtime)
}

const published = { published: true }
const readableUser = { id: 5 }
const none = { id: { in: [] } } // what `{ OR: [] }` becomes: false in every position

describe('root where', () => {
  beforeEach(() => setup())

  it('empty or undefined where: only the scope (or undefined without scope)', () => {
    configure({ Post: published })
    expect(mergeScope(findMany, {}, {})).toEqual({ AND: [published] })
    expect(mergeScope(findMany, { where: undefined }, {})).toEqual({ AND: [published] })
    expect(mergeScope(findMany, { where: null }, {})).toEqual({ AND: [published] })
    configure()
    expect(mergeScope(findMany, {}, {})).toBeUndefined()
    expect(mergeScope(findMany, { where: undefined }, {})).toBeUndefined()
  })

  it('without scope, hoisting nor rewrite the original where comes back as is', () => {
    configure()
    const where = { title: { contains: 'a' } }
    expect(mergeScope(findMany, { where }, {})).toBe(where)
  })

  it('the client AND is kept next to the scope', () => {
    configure({ Post: published })
    const where = { AND: [{ title: 'a' }], title: { contains: 'x' } }
    expect(mergeScope(findMany, { where }, {})).toEqual({ AND: [where, published] })
  })

  it('findUnique: unique key on top and the client AND preserved', () => {
    configure({ Post: published })
    expect(mergeScope(findUnique, { where: { id: 1 } }, {})).toEqual({ id: 1, AND: [published] })
    expect(mergeScope(findUnique, { where: { id: 1, AND: [{ title: 'a' }] } }, {})).toEqual({
      id: 1,
      AND: [{ title: 'a' }, published],
    })
    expect(mergeScope(findUnique, { where: { id: 1, AND: { title: 'a' } } }, {})).toEqual({
      id: 1,
      AND: [{ title: 'a' }, published],
    })
  })

  it('findUnique with OR and NOT of the client does not skip the scope', () => {
    configure({ Post: published })
    const result = mergeScope(findUnique, { where: { id: 1, OR: [{ title: 'a' }], NOT: { title: 'b' } } }, {})
    expect(result).toEqual({ id: 1, OR: [{ title: 'a' }], NOT: { title: 'b' }, AND: [published] })
  })

  it('findUnique without scope returns the where untouched', () => {
    configure()
    const where = { id: 1 }
    expect(mergeScope(findUnique, { where }, {})).toBe(where)
  })

  it('updateOne / deleteOne use the unique shape, updateMany / deleteMany / count / findFirst the list one', () => {
    configure({ Post: published })
    expect(mergeScope(query('Post', 'updateOne'), { where: { id: 1 } }, {})).toEqual({ id: 1, AND: [published] })
    expect(mergeScope(query('Post', 'deleteOne'), { where: { id: 1 } }, {})).toEqual({ id: 1, AND: [published] })
    for (const operation of ['updateMany', 'deleteMany', 'count', 'findFirst'] as const)
      expect(mergeScope(query('Post', operation), { where: { title: 'a' } }, {})).toEqual({
        AND: [{ title: 'a' }, published],
      })
  })

  it('the scope of a write can differ per operation', () => {
    configureExposure({
      fieldAccess: () => true,
      fieldScope: () => undefined,
      scope: (t) => (t.kind === 'relation' ? undefined : t.operation === 'deleteOne' ? { ownerId: 1 } : undefined),
    })
    expect(mergeScope(query('Post', 'deleteOne'), { where: { id: 1 } }, {})).toEqual({ id: 1, AND: [{ ownerId: 1 }] })
    expect(mergeScope(query('Post', 'updateOne'), { where: { id: 1 } }, {})).toEqual({ id: 1 })
  })

  it('does not mutate the arguments of the client', () => {
    configure({ Post: published, User: readableUser }, { 'User.email': { id: 5 } })
    const args = {
      where: { AND: [{ title: 'a' }], author: { is: { email: 'x' } }, comments: { some: { body: 'z' } } },
      orderBy: [{ title: 'asc' }],
    }
    const snapshot = JSON.parse(JSON.stringify(args))
    mergeScope(findMany, args, {})
    expect(args).toEqual(snapshot)
  })

  it('explicit null filters are passed through', () => {
    configure({ Post: published })
    expect(mergeScope(findMany, { where: { title: null, author: null } }, {})).toBeDefined()
    configure()
    const where = { title: null }
    expect(mergeScope(findMany, { where }, {})).toBe(where)
  })

  it('filters of scalar lists (has, hasSome) are not touched', () => {
    setup(manifestOf({ Post: model({ id: scalar(), tags: scalar([], 'String') }, { findMany: [] }) }))
    configure({ Post: published })
    const where = { tags: { hasSome: ['a', 'b'] } }
    expect(mergeScope(findMany, { where }, {})).toEqual({ AND: [where, published] })
  })

  it('a compound unique key is traversed as fields of the same model', () => {
    setup(manifestOf({ Token: model({ userId: scalar(['guarded']), token: scalar() }, { findUnique: [] }) }))
    configure({}, { 'Token.userId': { ok: 1 } })
    const where = { userId_token: { userId: 1, token: 'a' } }
    expect(mergeScope(query('Token', 'findUnique'), { where }, {})).toEqual({ ...where, AND: [{ ok: 1 }] })
  })

  it('a key that is not in the manifest fails with an explicit error', () => {
    configure()
    expect(() => mergeScope(findMany, { where: { nope: 1 } }, {})).toThrow(
      /Field "nope" of model "Post" is not in the exposure manifest/,
    )
  })

  it('a model missing from the manifest fails with an explicit error', () => {
    configure()
    expect(() => mergeScope(query('Ghost', 'findMany'), { where: { a: 1 } }, {})).toThrow(
      /Model "Ghost" is not in the exposure manifest/,
    )
  })

  it('without a registered manifest it fails closed', () => {
    resetExposureForTests()
    expect(() => mergeScope(findMany, { where: { a: 1 } }, {})).toThrow(/manifest is not registered/)
  })

  it('a where 50 levels deep does not exhaust the stack, and absurd depth is rejected', () => {
    configure({ Post: published })
    const nest = (depth: number): Where => (depth === 0 ? { title: 'a' } : { AND: [nest(depth - 1)] })
    expect(() => mergeScope(findMany, { where: nest(50) }, {})).not.toThrow()
    try {
      mergeScope(findMany, { where: nest(2000) }, {})
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ExposureError)
      expect((error as ExposureError).code).toBe('FORBIDDEN')
    }
  })

  it('a deep where takes linear time', () => {
    configure({ Post: published })
    const time = (n: number) => {
      const nest = (d: number): Where => (d === 0 ? { title: 'a' } : { AND: [nest(d - 1), { title: 'b' }] })
      const where = nest(n)
      const start = performance.now()
      for (let i = 0; i < 50; i++) mergeScope(findMany, { where }, {})
      return performance.now() - start
    }
    time(100) // warm up
    const small = time(100)
    const large = time(400)
    expect(large).toBeLessThan(Math.max(small * 4 * 6, 200)) // 4x the nodes: far from quadratic
  })
})

describe('relations', () => {
  beforeEach(() => setup())

  it('some gets the scope of the target', () => {
    configure({ Post: published })
    const result = mergeScope(users, { where: { posts: { some: { title: 'a' } } } }, {})
    expect(result).toEqual({ AND: [{ posts: { some: { AND: [{ title: 'a' }, published] } } }] })
  })

  it('none gets the scope of the target', () => {
    configure({ Post: published })
    expect(mergeScope(users, { where: { posts: { none: { title: 'a' } } } }, {})).toEqual({
      AND: [{ posts: { none: { AND: [{ title: 'a' }, published] } } }],
    })
  })

  it('every => OR[NOT scope, W]', () => {
    configure({ Post: published })
    expect(mergeScope(users, { where: { posts: { every: { title: 'a' } } } }, {})).toEqual({
      AND: [{ posts: { every: { OR: [{ NOT: published }, { title: 'a' }] } } }],
    })
  })

  it('is and direct filter of a to-one relation', () => {
    configure({ User: readableUser })
    expect(mergeScope(findMany, { where: { author: { is: { name: 'a' } } } }, {})).toEqual({
      AND: [{ author: { is: { AND: [{ name: 'a' }, readableUser] } } }],
    })
    expect(mergeScope(findMany, { where: { author: { name: 'a' } } }, {})).toEqual({
      AND: [{ author: { is: { AND: [{ name: 'a' }, readableUser] } } }],
    })
  })

  it('isNot', () => {
    configure({ User: readableUser })
    expect(mergeScope(findMany, { where: { author: { isNot: { name: 'a' } } } }, {})).toEqual({
      AND: [{ author: { isNot: { AND: [{ name: 'a' }, readableUser] } } }],
    })
  })

  it('nested relations at three levels', () => {
    configure({ Post: published, User: readableUser, Comment: { ok: 1 } })
    const where = { author: { is: { posts: { some: { comments: { some: { body: 'x' } } } } } } }
    expect(mergeScope(findMany, { where }, {})).toEqual({
      AND: [
        {
          author: {
            is: {
              AND: [
                { posts: { some: { AND: [{ comments: { some: { AND: [{ body: 'x' }, { ok: 1 }] } } }, published] } } },
                readableUser,
              ],
            },
          },
        },
        published, // the scope of the root model
      ],
    })
  })

  it('relations inside AND / OR / NOT', () => {
    configure({ Post: published })
    const result = mergeScope(
      users,
      { where: { OR: [{ posts: { some: { title: 'a' } } }], NOT: { posts: { none: {} } }, AND: [{ name: 'x' }] } },
      {},
    ) as any
    const inner = result.AND[0]
    expect(inner.OR[0]).toEqual({ posts: { some: { AND: [{ title: 'a' }, published] } } })
    expect(inner.NOT).toEqual({ posts: { none: { AND: [{}, published] } } })
    expect(inner.AND).toEqual([{ name: 'x' }])
  })

  it('a relation without restrictions for the target is left alone', () => {
    configure({})
    const where = { posts: { some: { title: 'a' } } }
    expect(mergeScope(users, { where }, {})).toBe(where)
  })

  it('a scope that returns { OR: [] } on the target gives an empty relation', () => {
    configure({ Post: { OR: [] } })
    expect(mergeScope(users, { where: { posts: { some: { title: 'a' } } } }, {})).toEqual({
      AND: [{ posts: { some: { AND: [{ title: 'a' }, none] } } }],
    })
  })

  it('is: null on a to-one relation means no VISIBLE related row', () => {
    configure({ User: readableUser })
    expect(mergeScope(findMany, { where: { author: { is: null } } }, {})).toEqual({
      AND: [{ AND: [{ NOT: { author: { is: readableUser } } }] }],
    })
    expect(mergeScope(findMany, { where: { author: { isNot: null } } }, {})).toEqual({
      AND: [{ AND: [{ author: { is: readableUser } }] }],
    })
    expect(mergeScope(findMany, { where: { author: null } }, {})).toEqual({
      AND: [{ AND: [{ NOT: { author: { is: readableUser } } }] }],
    })
    configure({})
    const where = { author: { is: null } }
    expect(mergeScope(findMany, { where }, {})).toBe(where)
  })

  it('every with an empty list of visible children stays true', () => {
    configure({ Post: { OR: [] } })
    // no child is visible: NOT scope holds for all, so `every` is satisfied by any parent
    expect(mergeScope(users, { where: { posts: { every: { title: 'a' } } } }, {})).toEqual({
      AND: [{ posts: { every: { OR: [{ NOT: none }, { title: 'a' }] } } }],
    })
  })

  it('isNot with an invisible target matches (treated as nonexistent)', () => {
    configure({ User: { OR: [] } })
    expect(mergeScope(findMany, { where: { author: { isNot: { name: 'a' } } } }, {})).toEqual({
      AND: [{ author: { isNot: { AND: [{ name: 'a' }, { id: { in: [] } }] } } }],
    })
  })

  it('a scope function that receives a RelationTarget gets model, field, target and isList', () => {
    const seen: RelationTarget[] = []
    configureExposure({
      fieldAccess: () => true,
      fieldScope: () => undefined,
      scope: (t) => {
        if (t.kind === 'relation') seen.push(t)
        return undefined
      },
    })
    mergeScope(users, { where: { posts: { some: {} } } }, {})
    expect(seen).toEqual([{ kind: 'relation', model: 'User', field: 'posts', targetModel: 'Post', isList: true }])
  })

  it('mergeScope for a list relation target uses the target model and the list shape', () => {
    configure({ Post: published })
    const target: RelationTarget = {
      kind: 'relation',
      model: 'User',
      field: 'posts',
      targetModel: 'Post',
      isList: true,
    }
    expect(mergeScope(target, { where: { title: 'a' } }, {})).toEqual({ AND: [{ title: 'a' }, published] })
    expect(mergeScope(target, {}, {})).toEqual({ AND: [published] })
  })

  it('a model with a field called "is" is treated as a direct filter', () => {
    setup(
      manifestOf({
        Post: model({ id: scalar(), author: relation('User', false) }, { findMany: [] }),
        User: model({ id: scalar(), is: scalar() }),
      }),
    )
    configure({ User: readableUser })
    expect(mergeScope(findMany, { where: { author: { is: 'x' } } }, {})).toEqual({
      AND: [{ author: { is: { AND: [{ is: 'x' }, readableUser] } } }],
    })
  })
})

describe('guarded scalars', () => {
  beforeEach(() => setup())
  const emailScope = { id: 5 }

  it('a guarded scalar at the root adds its fieldScope', () => {
    configure({}, { 'User.email': emailScope })
    expect(mergeScope(users, { where: { email: { startsWith: 'a' } } }, {})).toEqual({
      AND: [{ email: { startsWith: 'a' } }, emailScope],
    })
  })

  it('inside a relation it adds the fieldScope of the target inside that relation', () => {
    configure({}, { 'User.email': emailScope })
    expect(mergeScope(findMany, { where: { author: { is: { email: 'a' } } } }, {})).toEqual({
      AND: [{ author: { is: { AND: [{ email: 'a' }, emailScope] } } }],
    })
  })

  it('inside OR it is hoisted to the root of the model', () => {
    configure({}, { 'User.email': emailScope })
    const where = { OR: [{ email: 'a' }, { name: 'b' }] }
    expect(mergeScope(users, { where }, {})).toEqual({ AND: [where, emailScope] })
  })

  it('inside NOT', () => {
    configure({}, { 'User.email': emailScope })
    const where = { NOT: { email: 'a' } }
    expect(mergeScope(users, { where }, {})).toEqual({ AND: [where, emailScope] })
  })

  it('several guarded scalars: AND of their fieldScopes', () => {
    setup(manifestOf({ User: model({ email: scalar(['guarded']), phone: scalar(['guarded']) }, { findMany: [] }) }))
    configure({}, { 'User.email': { a: 1 }, 'User.phone': { b: 2 } })
    const where = { email: 'x', phone: 'y' }
    expect(mergeScope(users, { where }, {})).toEqual({ AND: [where, { a: 1 }, { b: 2 }] })
  })

  it('a fieldScope that returns undefined does not restrict', () => {
    configure({}, {})
    const where = { email: 'a' }
    expect(mergeScope(users, { where }, {})).toBe(where)
  })

  it('orderBy by a guarded scalar of the own model adds its fieldScope', () => {
    configure({}, { 'User.email': emailScope })
    expect(mergeScope(users, { orderBy: [{ email: 'asc' }] }, {})).toEqual({ AND: [emailScope] })
    expect(mergeScope(users, { orderBy: { email: 'asc' } }, {})).toEqual({ AND: [emailScope] })
    expect(mergeScope(users, { orderBy: [{ name: 'asc' }] }, {})).toBeUndefined()
  })

  it('cursor by a guarded scalar', () => {
    configure({}, { 'User.email': emailScope })
    expect(mergeScope(users, { cursor: { email: 'a' } }, {})).toEqual({ AND: [emailScope] })
    expect(mergeScope(users, { cursor: { id: 1 } }, {})).toBeUndefined()
  })

  it('distinct by a guarded scalar', () => {
    configure({}, { 'User.email': emailScope })
    expect(mergeScope(users, { distinct: ['email'] }, {})).toEqual({ AND: [emailScope] })
    expect(mergeScope(users, { distinct: ['name'] }, {})).toBeUndefined()
  })

  it('findUnique by a guarded scalar', () => {
    configure({}, { 'User.email': emailScope })
    expect(mergeScope(query('User', 'findUnique'), { where: { email: 'a' } }, {})).toEqual({
      email: 'a',
      AND: [emailScope],
    })
  })

  it('without fieldScope configured, filtering by a guarded field is rejected', () => {
    configure({}, false)
    for (const args of [
      { where: { email: 'a' } },
      { orderBy: [{ email: 'asc' }] },
      { cursor: { email: 'a' } },
      { distinct: ['email'] },
    ])
      expect(() => mergeScope(users, args, {})).toThrow(/guarded and no fieldScope is configured/)
  })

  it('the fieldScope of the same filter is not evaluated when no guarded field is used', () => {
    const fieldScope = vi.fn()
    configureExposure({ fieldAccess: () => true, fieldScope })
    mergeScope(users, { where: { name: 'a' }, orderBy: [{ name: 'asc' }] }, {})
    expect(fieldScope).not.toHaveBeenCalled()
  })
})

describe('orderBy through relations', () => {
  beforeEach(() => setup())

  it('is rejected when the target has a scope', () => {
    configure({ User: readableUser })
    try {
      mergeScope(findMany, { orderBy: [{ author: { name: 'asc' } }] }, {})
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ExposureError)
      expect((error as ExposureError).code).toBe('FORBIDDEN')
    }
  })

  it('_count of a relation with scope is rejected', () => {
    configure({ Post: published })
    expect(() => mergeScope(users, { orderBy: [{ posts: { _count: 'asc' } }] }, {})).toThrow(ExposureError)
  })

  it('is allowed when the target has no restrictions', () => {
    configure({})
    expect(mergeScope(findMany, { orderBy: [{ author: { name: 'asc' } }] }, {})).toBeUndefined()
    expect(mergeScope(users, { orderBy: [{ posts: { _count: 'desc' } }] }, {})).toBeUndefined()
  })

  it('is rejected when it reaches a guarded scalar of the target that has a fieldScope', () => {
    configure({}, { 'User.email': { id: 5 } })
    expect(() => mergeScope(findMany, { orderBy: [{ author: { email: 'asc' } }] }, {})).toThrow(ExposureError)
    expect(mergeScope(findMany, { orderBy: [{ author: { name: 'asc' } }] }, {})).toBeUndefined()
  })
})
