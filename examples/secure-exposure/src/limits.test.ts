import type { Viewer } from './context'
import { schema } from './schema'
import { setupSecurity } from './security'
import { createTestDb, dataOf, type Db, run, viewers } from './test-utils'

/** `maxTake` against a real database, in root queries and in list relations, with and without scope */
let db: Db
beforeAll(async () => {
  db = createTestDb()
  const { prisma } = db
  await prisma.user.createMany({
    data: [
      { id: 1, email: 'admin@x.com', passwordHash: 'h', role: 'admin' },
      { id: 5, email: 'member@x.com', passwordHash: 'h' },
      { id: 6, email: 'other@x.com', passwordHash: 'h' },
    ],
  })
  // 60 published posts by user 6, and 3 drafts of the member
  await prisma.post.createMany({
    data: [
      ...Array.from({ length: 60 }, (_, i) => ({ id: 100 + i, title: `p${i}`, published: true, authorId: 6 })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: 200 + i, title: `d${i}`, published: false, authorId: 5 })),
    ],
  })
})
afterAll(() => db.dispose())
beforeEach(() => setupSecurity())

const count = async (source: string, viewer: Viewer | undefined = viewers.admin) => {
  const data = dataOf(await run(schema, db, source, viewer))
  return data
}

describe('maxTake', () => {
  it.each([
    ['take: 1000', 50],
    ['take: -1000', 50],
    ['', 50],
    ['take: 0', 0],
    ['take: 3', 3],
    ['take: -3', 3],
    ['take: 1000, skip: 20', 43],
  ])('findManyPost(%s) returns %i rows for an admin', async (args, expected) => {
    const { findManyPost } = await count(`{ findManyPost${args ? `(${args})` : ''} { id } }`)
    expect(findManyPost).toHaveLength(expected)
  })

  it('a negative take paginates backwards from the end, and it is capped too', async () => {
    const { findManyPost } = await count('{ findManyPost(take: -1000) { id } }')
    const rows = findManyPost.map((p: any) => Number(p.id))
    expect(rows).toHaveLength(50)
    // The last 50 of the 63 rows, in the order of the query
    expect(rows[rows.length - 1]).toBe(202)
    expect(rows).toEqual([...rows].sort((a, b) => a - b))
  })

  it('skip paginates past the cap', async () => {
    const { findManyPost } = await count('{ findManyPost(take: 1000, skip: 50) { id } }')
    expect(findManyPost).toHaveLength(13)
  })

  it('count is not limited', async () => {
    expect((await count('{ countPost }')).countPost).toBe(63)
  })

  it('cursor works with the cap', async () => {
    const { findManyPost } = await count('{ findManyPost(cursor: { id: 110 }, take: 1000) { id } }')
    expect(findManyPost).toHaveLength(50)
    expect(findManyPost[0].id).toBe('110')
  })

  it('a list relation is limited too, with and without scope', async () => {
    const admin = await count('{ findManyUser(where: { id: { equals: 6 } }) { posts(take: 1000) { id } } }')
    expect(admin.findManyUser[0].posts).toHaveLength(50)
    const negative = await count('{ findManyUser(where: { id: { equals: 6 } }) { posts(take: -1000) { id } } }')
    expect(negative.findManyUser[0].posts).toHaveLength(50)
    const noTake = await count('{ findManyUser(where: { id: { equals: 6 } }) { posts { id } } }', viewers.member)
    expect(noTake.findManyUser[0].posts).toHaveLength(50)
    // With scope: the member does not see the drafts of others, but their own
    const own = await count('{ findManyUser(where: { id: { equals: 5 } }) { posts { id published } } }', viewers.member)
    expect(own.findManyUser[0].posts).toHaveLength(3)
    const others = await count('{ findManyUser(where: { id: { equals: 6 } }) { posts(take: 5) { id published } } }', viewers.member)
    expect(others.findManyUser[0].posts.every((p: any) => p.published)).toBe(true)
  })
})
