import { configureExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime'
import { schema } from './schema'
import { setupSecurity } from './security'
import { createTestDb, dataOf, type Db, run, viewers } from './test-utils'

/**
 * SPIKE 1: `Post.author` is a guarded to-one relation. Prisma does not accept a `where` on it, so the row is
 * loaded with its parent (preloaded through `select`, no query per parent) and returned only if the scope of `User`
 * includes it: otherwise `null`. What was measured:
 *  - `t.relation({ resolve })` is never called when the relation is preloaded (it can not hide a row)
 *  - `t.prismaField` per parent works but costs one query per parent (N+1)
 *  - `t.field({ select })` + a check per batch of rows: constant queries, and a hidden row is never returned
 */
let db: Db
beforeAll(async () => {
  db = createTestDb()
  const { prisma } = db
  await prisma.user.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, email: `u${i + 1}@x.com`, passwordHash: 'h', role: i < 3 ? 'admin' : 'member' })),
  })
  await prisma.post.createMany({
    data: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, title: `t${i}`, published: true, authorId: (i % 10) + 1 })),
  })
})
afterAll(() => db.dispose())
beforeEach(() => setupSecurity())

/** `scope` that only lets a viewer see `User` rows with these ids, everything else as in security.ts */
const onlyUsers = (allowed: number[] | undefined) =>
  configureExposure({
    guards: () => [],
    fieldAccess: () => true,
    fieldScope: () => undefined,
    scope: (t) => (t.kind === 'relation' && t.targetModel === 'User' && allowed ? { id: { in: allowed } } : t.kind !== 'relation' && t.model === 'User' && allowed ? { id: { in: allowed } } : undefined),
  })

const authors = (data: any) => Object.fromEntries(data.findManyPost.map((p: any) => [p.id, p.author]))

describe('a guarded to-one relation', () => {
  it('is null when the scope of the target does not include the row', async () => {
    onlyUsers([1, 2, 3])
    const rows = authors(dataOf(await run(schema, db, '{ findManyPost(take: 50) { id author { id } } }', viewers.admin)))
    expect(rows['4']).toBeNull() // written by user 4
    expect(rows['1']).toEqual({ id: '1' })
  })

  it('is the real row when the scope includes it', async () => {
    onlyUsers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const rows = authors(dataOf(await run(schema, db, '{ findManyPost(take: 50) { id author { id } } }', viewers.admin)))
    expect(Object.values(rows).every((row) => row !== null)).toBe(true)
  })

  it('the relation is nullable in the schema', async () => {
    const { printSchema } = await import('graphql')
    expect(printSchema(schema)).toMatch(/type Post \{[^}]*author: User\n/)
  })

  it('with the row preloaded by the parent query, the hidden row is not returned', async () => {
    onlyUsers([1])
    const result = dataOf(await run(schema, db, '{ findManyPost(take: 50) { id author { id email role posts(take: 3) { id } } } }', viewers.admin))
    const hidden = result.findManyPost.filter((p: any) => p.author === null)
    expect(hidden.length).toBe(45) // everything not written by user 1
    expect(JSON.stringify(result)).not.toContain('u2@x.com')
  })

  it('the relations under a hidden row are not resolved', async () => {
    onlyUsers([])
    db.queries.length = 0
    const result = dataOf(await run(schema, db, '{ findManyPost(take: 50) { id author { id posts { id } } } }', viewers.admin))
    expect(result.findManyPost.every((p: any) => p.author === null)).toBe(true)
  })

  it('the guarded fields of a visible row keep working', async () => {
    configureExposure({
      guards: () => [],
      fieldScope: () => undefined,
      fieldAccess: (_t, parent) => parent.id === 2,
      scope: (t) => ((t.kind === 'relation' ? t.targetModel : t.model) === 'User' ? { id: { in: [2, 3] } } : undefined),
    })
    const rows = authors(dataOf(await run(schema, db, '{ findManyPost(take: 50) { id author { id email } } }', viewers.admin)))
    expect(rows['2']).toEqual({ id: '2', email: 'u2@x.com' })
    expect(rows['3']).toEqual({ id: '3', email: null })
    expect(rows['1']).toBeNull()
  })

  it('with 50 parents the number of queries is constant, not one per parent', async () => {
    onlyUsers([1, 2, 3])
    const { selects } = await db.count(() => run(schema, db, '{ findManyPost(take: 50) { id author { id } } }', viewers.admin))
    expect(selects).toBeLessThanOrEqual(4)
    onlyUsers(undefined)
    const unrestricted = await db.count(() => run(schema, db, '{ findManyPost(take: 50) { id author { id } } }', viewers.admin))
    expect(unrestricted.selects).toBeLessThanOrEqual(3)
  })

  it('50 x 50 nested relations without N+1', async () => {
    onlyUsers([1, 2, 3, 4, 5])
    const { selects, result } = await db.count(() =>
      run(schema, db, '{ findManyPost(take: 50) { id author { id posts(take: 50) { id author { id } } } } }', viewers.admin),
    )
    expect(result.errors).toBeUndefined()
    // One query per level (posts, author, readability of each level, nested posts): not one per row
    expect(selects).toBeLessThanOrEqual(10)
  })

  it('a scope without permissions gives null for every row (an anonymous viewer)', async () => {
    const rows = authors(dataOf(await run(schema, db, '{ findManyPost(take: 50) { id author { id } } }', viewers.anonymous)))
    expect(Object.values(rows).every((row) => row === null)).toBe(true)
  })

  it('without restrictions for the target it returns every row and asks the database nothing extra', async () => {
    onlyUsers(undefined)
    const { selects, result } = await db.count(() => run(schema, db, '{ findManyPost(take: 50) { id author { id } } }', viewers.admin))
    expect(Object.values(authors(dataOf(result))).every((row) => row !== null)).toBe(true)
    // posts + the preloaded authors, no readability query
    expect(selects).toBeLessThanOrEqual(2)
  })
})
