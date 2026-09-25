import {
  configureExposure,
  type ExposureManifest,
  type ManifestField,
  mergeScope,
  type OperationTarget,
  registerManifest,
  resetExposureForTests,
  type Where,
} from '@wokcito/prisma-generator-pothos-codegen/runtime'
import { createTestDb, type Db } from './test-utils'

/**
 * SPIKE 2 and 3, against a real database. The rewrites of `mergeScope` must make a row that scope hides behave as if it
 * did not exist: `some` / `none` / `every` / `is` / `isNot` / direct filters, nested, inside AND / OR / NOT, with null.
 * (`mode: 'insensitive'` only exists in Postgres: sqlite can not run it.)
 */
const scalar = (type = 'String'): ManifestField => ({ kind: 'scalar', type, states: [] })
const relation = (targetModel: string, isList: boolean, fromFields: string[] = []): ManifestField => ({
  kind: 'relation',
  targetModel,
  isList,
  fromFields,
  states: [],
})

/** The models of these tests: the generated manifest only has the ones the example exposes (User and Post) */
const manifest: ExposureManifest = {
  version: 1,
  generator: 'test',
  models: {
    User: {
      operations: {},
      fields: { id: scalar('Int'), email: scalar(), name: scalar(), posts: relation('Post', true) },
    },
    Post: {
      operations: {},
      fields: {
        id: scalar('Int'),
        title: scalar(),
        published: scalar('Boolean'),
        authorId: scalar('Int'),
        author: relation('User', false, ['authorId']),
        comments: relation('Comment', true),
      },
    },
    Comment: {
      operations: {},
      fields: { id: scalar('Int'), body: scalar(), postId: scalar('Int'), post: relation('Post', false, ['postId']) },
    },
  },
}

let db: Db
beforeAll(async () => {
  resetExposureForTests()
  registerManifest(manifest)
  db = createTestDb()
  const { prisma } = db
  await prisma.user.createMany({
    data: [
      { id: 1, email: 'u1@x.com', passwordHash: 'h' },
      { id: 2, email: 'u2@x.com', passwordHash: 'h' },
      { id: 3, email: 'u3@x.com', passwordHash: 'h' },
    ],
  })
  await prisma.post.createMany({
    data: [
      { id: 1, title: 'p1 public', published: true, authorId: 1 },
      { id: 2, title: 'p2 draft', published: false, authorId: 1 },
      { id: 3, title: 'p3 public', published: true, authorId: 2 },
      { id: 4, title: 'p4 draft', published: false, authorId: 2 },
    ],
  })
  await prisma.comment.createMany({
    data: [
      { id: 1, body: 'ok', postId: 1 },
      { id: 2, body: 'ok', postId: 2 },
      { id: 3, body: 'secret', postId: 3 },
      { id: 4, body: 'ok', postId: 4 },
    ],
  })
})
afterAll(() => db.dispose())

const target = (model: string, operation: OperationTarget['operation'] = 'findMany'): OperationTarget => ({
  kind: operation.startsWith('find') ? 'query' : 'mutation',
  model,
  operation,
  tags: [],
})

const use = (scopes: Partial<Record<'User' | 'Post' | 'Comment', Where>>) =>
  configureExposure({
    guards: () => [],
    fieldAccess: () => true,
    fieldScope: () => undefined,
    scope: (t) => scopes[(t.kind === 'relation' ? t.targetModel : t.model) as 'User' | 'Post' | 'Comment'],
  })

const users = async (where: unknown) => {
  const merged = mergeScope(target('User'), { where }, {})
  return (await db.prisma.user.findMany({ where: merged, orderBy: { id: 'asc' } })).map((u) => u.id)
}
const posts = async (where: unknown) => {
  const merged = mergeScope(target('Post'), { where }, {})
  return (await db.prisma.post.findMany({ where: merged, orderBy: { id: 'asc' } })).map((p) => p.id)
}

const visiblePosts = { published: true }

describe('list relations', () => {
  it('some: only visible children count', async () => {
    const where = { posts: { some: { published: { equals: false } } } }
    use({})
    expect(await users(where)).toEqual([1, 2])
    use({ Post: visiblePosts })
    expect(await users(where)).toEqual([])
  })

  it('none: an invisible child does not prevent the match', async () => {
    const where = { posts: { none: { title: { contains: 'draft' } } } }
    use({})
    expect(await users(where)).toEqual([3])
    use({ Post: visiblePosts })
    expect(await users(where)).toEqual([1, 2, 3])
  })

  it('every: it is evaluated over the visible children only (vacuously true without them)', async () => {
    const where = { posts: { every: { title: { startsWith: 'p1' } } } }
    use({})
    expect(await users(where)).toEqual([3])
    use({ Post: visiblePosts })
    expect(await users(where)).toEqual([1, 3])
  })

  it('every with no visible child at all is true for everybody', async () => {
    use({ Post: { OR: [] } })
    expect(await users({ posts: { every: { title: { startsWith: 'zzz' } } } })).toEqual([1, 2, 3])
    expect(await users({ posts: { some: {} } })).toEqual([])
    expect(await users({ posts: { none: {} } })).toEqual([1, 2, 3])
  })

  it('three levels: a child that scope hides at any level does not count', async () => {
    const where = { posts: { some: { comments: { some: { body: { equals: 'secret' } } } } } }
    use({})
    expect(await users(where)).toEqual([2])
    use({ Comment: { body: { not: 'secret' } } })
    expect(await users(where)).toEqual([])
    use({ Post: { published: false } }) // the post with the comment is public: not visible with this scope
    expect(await users(where)).toEqual([])
  })

  it('inside AND / OR / NOT', async () => {
    use({ Post: visiblePosts })
    expect(await users({ NOT: { posts: { some: { published: { equals: false } } } } })).toEqual([1, 2, 3])
    expect(await users({ OR: [{ posts: { some: { published: { equals: false } } } }, { id: { equals: 3 } }] })).toEqual([3])
    expect(await users({ AND: [{ posts: { some: { title: { contains: 'draft' } } } }] })).toEqual([])
    use({})
    expect(await users({ NOT: { posts: { some: { published: { equals: false } } } } })).toEqual([3])
  })
})

describe('to-one relations', () => {
  const userScope = { id: { in: [1, 3] } }

  it('is / direct filter: an invisible author does not match', async () => {
    use({ User: userScope })
    expect(await posts({ author: { is: { email: { contains: 'u' } } } })).toEqual([1, 2])
    expect(await posts({ author: { email: { contains: 'u' } } })).toEqual([1, 2])
    use({})
    expect(await posts({ author: { is: { email: { contains: 'u' } } } })).toEqual([1, 2, 3, 4])
  })

  it('isNot: a post whose author is invisible matches (it is treated as nonexistent)', async () => {
    use({ User: userScope })
    expect(await posts({ author: { isNot: { id: { equals: 1 } } } })).toEqual([3, 4])
    use({})
    expect(await posts({ author: { isNot: { id: { equals: 1 } } } })).toEqual([3, 4])
    use({ User: { OR: [] } })
    expect(await posts({ author: { isNot: { id: { equals: 1 } } } })).toEqual([1, 2, 3, 4])
  })

  it('is: null / isNot: null / null mean "no visible related row" / "a visible related row"', async () => {
    use({ User: userScope })
    expect(await posts({ author: { is: null } })).toEqual([3, 4])
    expect(await posts({ author: { isNot: null } })).toEqual([1, 2])
    expect(await posts({ author: null })).toEqual([3, 4])
    // (without a scope the filter is passed as is, and Prisma itself rejects `is: null` on a required relation)
  })
})

describe('the scope that means "no rows"', () => {
  it('{ OR: [] } is false in every position (Prisma ignores it as an element of an AND)', async () => {
    use({ Post: { OR: [] } })
    expect(await posts({})).toEqual([])
    expect(await posts({ title: { contains: 'p' } })).toEqual([])
    expect(await users({ posts: { some: { title: { contains: 'p' } } } })).toEqual([])
    expect(await users({ NOT: { posts: { some: {} } } })).toEqual([1, 2, 3])
    // and the raw form Prisma would have let through:
    expect((await db.prisma.post.findMany({ where: { AND: [{ title: { contains: 'p' } }, { OR: [] }] } })).length).toBe(4)
  })
})

describe('SPIKE 3: scope on writes', () => {
  const owner = (id: number): Where => ({ authorId: id })

  it('updateOne / deleteOne keep the unique key and add the scope under AND', async () => {
    use({ Post: owner(1) })
    const where = mergeScope(target('Post', 'updateOne'), { where: { id: 1 } }, {})
    expect(where).toEqual({ id: 1, AND: [{ authorId: 1 }] })
    const updated = await db.prisma.post.update({ where, data: { title: 'p1 public (edited)' } })
    expect(updated.title).toBe('p1 public (edited)')
  })

  it('a row outside the scope: Prisma raises P2025 (record not found), as if it did not exist', async () => {
    use({ Post: owner(1) })
    const outside = mergeScope(target('Post', 'updateOne'), { where: { id: 3 } }, {})
    await expect(db.prisma.post.update({ where: outside, data: { title: 'hacked' } })).rejects.toMatchObject({ code: 'P2025' })
    await expect(db.prisma.post.delete({ where: mergeScope(target('Post', 'deleteOne'), { where: { id: 3 } }, {}) })).rejects.toMatchObject({ code: 'P2025' })
    expect((await db.prisma.post.findUnique({ where: { id: 3 } }))?.title).toBe('p3 public')
  })

  it('updateMany and deleteMany only touch the rows in scope', async () => {
    use({ Post: owner(2) })
    const updated = await db.prisma.post.updateMany({ where: mergeScope(target('Post', 'updateMany'), { where: { title: { contains: 'p' } } }, {}), data: { published: true } })
    expect(updated.count).toBe(2)
    expect((await db.prisma.post.findUnique({ where: { id: 1 } }))?.published).toBe(true) // it was already public
    expect((await db.prisma.post.findUnique({ where: { id: 2 } }))?.published).toBe(false) // out of scope: untouched
    const deleted = await db.prisma.comment.deleteMany({ where: mergeScope(target('Comment', 'deleteMany'), { where: {} }, {}) })
    expect(deleted.count).toBe(4) // Comment has no scope here
  })

  it('a client AND next to the unique key is kept and Prisma accepts the shape', async () => {
    use({ Post: owner(1) })
    const where = mergeScope(target('Post', 'updateOne'), { where: { id: 2, AND: [{ published: { equals: false } }] } }, {})
    expect(where).toEqual({ id: 2, AND: [{ published: { equals: false } }, { authorId: 1 }] })
    await expect(db.prisma.post.update({ where, data: { title: 'p2 draft (edited)' } })).resolves.toMatchObject({ id: 2 })
  })
})
