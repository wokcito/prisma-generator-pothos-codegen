import { printSchema } from 'graphql'
import { configureExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime'
import { schema } from './schema'
import { setupSecurity } from './security'
import { createTestDb, dataOf, type Db, errorCodes, run, seedRules, viewers } from './test-utils'

/**
 * every row of the table of the design, for an anonymous viewer, a member (id 5) and an admin, against a REAL
 * sqlite database: what guarantees the exposure depend on how Prisma itself validates the `where` the generated code builds.
 */
let db: Db
beforeAll(async () => {
  db = createTestDb()
  await seedRules(db)
})
afterAll(() => db.dispose())
beforeEach(() => setupSecurity())

const ids = (rows: { id: string | number }[]) => rows.map((r) => Number(r.id)).sort((a, b) => a - b)
const who = ['anonymous', 'member', 'admin'] as const

describe('findManyPost', () => {
  it.each([
    ['anonymous', [1, 3, 5]],
    ['member', [1, 3, 4, 5]],
    ['admin', [1, 2, 3, 4, 5, 6]],
  ] as const)('a %s sees the published posts (and their own)', async (role, expected) => {
    const { findManyPost } = dataOf(await run(schema, db, '{ findManyPost { id } }', viewers[role]))
    expect(ids(findManyPost)).toEqual(expected)
  })

  it('countPost respects the scope', async () => {
    expect(dataOf(await run(schema, db, '{ countPost }', viewers.anonymous)).countPost).toBe(3)
    expect(dataOf(await run(schema, db, '{ countPost }', viewers.member)).countPost).toBe(4)
    expect(dataOf(await run(schema, db, '{ countPost }', viewers.admin)).countPost).toBe(6)
  })

  it('author is null for an anonymous viewer: the scope of User is "no rows"', async () => {
    const { findManyPost } = dataOf(await run(schema, db, '{ findManyPost { title author { email } } }', viewers.anonymous))
    expect(findManyPost).toHaveLength(3)
    expect(findManyPost.every((post: any) => post.author === null)).toBe(true)
  })

  it('a member reads the email of their own posts and gets null for the ones of others', async () => {
    const { findManyPost } = dataOf(await run(schema, db, '{ findManyPost { id author { id email } } }', viewers.member))
    const byId = Object.fromEntries(findManyPost.map((p: any) => [p.id, p.author]))
    expect(byId['3']).toEqual({ id: '5', email: 'member@x.com' })
    expect(byId['4']).toEqual({ id: '5', email: 'member@x.com' })
    expect(byId['1']).toEqual({ id: '1', email: null })
    expect(byId['5']).toEqual({ id: '6', email: null })
  })

  it('an admin reads every email', async () => {
    const { findManyPost } = dataOf(await run(schema, db, '{ findManyPost { author { email } } }', viewers.admin))
    expect(findManyPost.every((post: any) => typeof post.author.email === 'string')).toBe(true)
  })

  it('a hidden relation and a hidden field are not in the schema', async () => {
    const result = await run(schema, db, '{ findManyPost { comments { body } } }', viewers.admin)
    expect(result.errors?.[0]?.message).toMatch(/Cannot query field "comments"/)
    const hidden = await run(schema, db, '{ findManyUser { passwordHash } }', viewers.admin)
    expect(hidden.errors?.[0]?.message).toMatch(/Cannot query field "passwordHash"/)
  })
})

describe('findManyUser', () => {
  it('an anonymous viewer gets UNAUTHENTICATED (the guards run in order: loggedIn first)', async () => {
    const result = await run(schema, db, '{ findManyUser { id } }', viewers.anonymous)
    expect(errorCodes(result)).toEqual(['UNAUTHENTICATED'])
    expect(result.data).toBeNull()
  })

  it('a member reads their own email and gets null for the others', async () => {
    const { findManyUser } = dataOf(await run(schema, db, '{ findManyUser { id email } }', viewers.member))
    expect(findManyUser).toHaveLength(4)
    for (const user of findManyUser) expect(user.email).toBe(Number(user.id) === 5 ? 'member@x.com' : null)
  })

  it('an admin reads every email', async () => {
    const { findManyUser } = dataOf(await run(schema, db, '{ findManyUser { email } }', viewers.admin))
    expect(findManyUser.map((u: any) => u.email).sort()).toEqual(['admin@x.com', 'mallory@x.com', 'member@x.com', 'other@x.com'])
  })

  it('a filter by email runs AND the rule of the field: a member only reaches their own row', async () => {
    const member = dataOf(await run(schema, db, '{ findManyUser(where: { email: { startsWith: "m" } }) { id email } }', viewers.member))
    // `mallory@x.com` also starts with "m": it must not be probed through the filter
    expect(member.findManyUser).toEqual([{ id: '5', email: 'member@x.com' }])
    const admin = dataOf(await run(schema, db, '{ findManyUser(where: { email: { startsWith: "m" } }) { id } }', viewers.admin))
    expect(ids(admin.findManyUser)).toEqual([5, 7])
  })

  it('a filter by email hidden in OR / NOT does not probe others either', async () => {
    const or = dataOf(await run(schema, db, '{ findManyUser(where: { OR: [{ email: { equals: "other@x.com" } }, { id: { equals: 5 } }] }) { id } }', viewers.member))
    expect(ids(or.findManyUser)).toEqual([5])
    const not = dataOf(await run(schema, db, '{ findManyUser(where: { NOT: { email: { equals: "other@x.com" } } }) { id } }', viewers.member))
    expect(ids(not.findManyUser)).toEqual([5])
  })

  it('ordering by a guarded field is limited to the rows where it is readable', async () => {
    const { findManyUser } = dataOf(await run(schema, db, '{ findManyUser(orderBy: [{ email: asc }]) { id } }', viewers.member))
    expect(ids(findManyUser)).toEqual([5])
  })

  it('filtering by a relation only counts the posts the viewer can read', async () => {
    const source = '{ findManyUser(where: { posts: { some: { published: { equals: false } } } }) { id } }'
    // a member can read their own drafts only: other users have drafts, but they do not exist for the member
    expect(ids(dataOf(await run(schema, db, source, viewers.member)).findManyUser)).toEqual([5])
    expect(ids(dataOf(await run(schema, db, source, viewers.admin)).findManyUser)).toEqual([1, 5, 6])
  })

  it('the filter by children of others is not an oracle', async () => {
    const source = '{ findManyUser(where: { posts: { some: { title: { contains: "secret" } } } }) { id } }'
    // The only post with "secret" is a draft of user 6
    expect(dataOf(await run(schema, db, source, viewers.member)).findManyUser).toEqual([])
    expect(ids(dataOf(await run(schema, db, source, viewers.admin)).findManyUser)).toEqual([6])
    const none = '{ findManyUser(where: { posts: { none: { title: { contains: "secret" } } } }) { id } }'
    // For the member the secret post does not exist, so nobody "has" it (user 6 included)
    expect(ids(dataOf(await run(schema, db, none, viewers.member)).findManyUser)).toEqual([1, 5, 6, 7])
    expect(ids(dataOf(await run(schema, db, none, viewers.admin)).findManyUser)).toEqual([1, 5, 7])
  })

  it('a filter by a field that is unfilterable is a schema error', async () => {
    for (const role of who) {
      const result = await run(schema, db, '{ findManyUser(where: { phone: { equals: "555" } }) { id } }', viewers[role])
      expect(result.errors?.[0]?.message).toMatch(/phone/)
    }
  })

  it('countUser does not exist (count is disabled for User)', async () => {
    for (const role of who) {
      const result = await run(schema, db, '{ countUser }', viewers[role])
      expect(result.errors?.[0]?.message).toMatch(/Cannot query field "countUser"/)
    }
  })
})

describe('findUniquePost', () => {
  const source = (id: number) => `{ findUniquePost(where: { id: ${id}, OR: [{ published: { equals: true } }, { published: { equals: false } }] }) { id title } }`

  it('a draft of another user is null for anonymous and members, the row for an admin', async () => {
    expect(dataOf(await run(schema, db, source(6), viewers.anonymous)).findUniquePost).toBeNull()
    expect(dataOf(await run(schema, db, source(6), viewers.member)).findUniquePost).toBeNull()
    expect(dataOf(await run(schema, db, source(6), viewers.admin)).findUniquePost).toEqual({ id: '6', title: 'other secret draft' })
  })

  it('AND / OR / NOT of the client do not skip the scope', async () => {
    const attempts = [
      '{ findUniquePost(where: { id: 6, NOT: { title: { equals: "nothing" } } }) { id } }',
      '{ findUniquePost(where: { id: 6, AND: [{ title: { contains: "secret" } }] }) { id } }',
      '{ findUniquePost(where: { id: 6, OR: [{ id: { equals: 6 } }] }) { id } }',
    ]
    for (const attempt of attempts) expect(dataOf(await run(schema, db, attempt, viewers.member)).findUniquePost).toBeNull()
    // Their own draft is fine, with a client AND that is kept
    const own = dataOf(await run(schema, db, '{ findUniquePost(where: { id: 4, AND: [{ title: { contains: "draft" } }] }) { id } }', viewers.member))
    expect(own.findUniquePost).toEqual({ id: '4' })
    const filtered = dataOf(await run(schema, db, '{ findUniquePost(where: { id: 4, AND: [{ title: { contains: "nope" } }] }) { id } }', viewers.member))
    expect(filtered.findUniquePost).toBeNull()
  })
})

describe('guards', () => {
  it('a guard that throws means Prisma is not called', async () => {
    const { selects } = await db.count(() => run(schema, db, '{ findManyUser { id } }', viewers.anonymous))
    expect(selects).toBe(0)
  })

  it('the order of the guards: an anonymous findManyUser is UNAUTHENTICATED, not FORBIDDEN', async () => {
    expect(errorCodes(await run(schema, db, '{ findManyUser { id } }', viewers.anonymous))).toEqual(['UNAUTHENTICATED'])
  })
})

describe('two scope functions are combined with AND', () => {
  it('a list of scopes', async () => {
    configureExposure({
      guards: () => [],
      fieldAccess: () => true,
      fieldScope: () => undefined,
      scope: [(t) => (t.kind !== 'relation' && t.model === 'Post' ? { published: true } : undefined), (t) => (t.kind !== 'relation' && t.model === 'Post' ? { authorId: { in: [1, 5] } } : undefined), () => undefined],
    })
    const { findManyPost } = dataOf(await run(schema, db, '{ findManyPost { id } }', viewers.admin))
    expect(ids(findManyPost)).toEqual([1, 3])
  })
})
