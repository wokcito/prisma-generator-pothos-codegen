import path from 'node:path'
import { loadContractFile } from './loader'
import { codecToGraphqlScalar, type SchemaModel, toSchemaModel } from './schema'

const simpleContractPath = path.join(__dirname, 'fixtures/simple/generated/contract.json')
const complexContractPath = path.join(__dirname, 'fixtures/complex/generated/contract.json')

describe('codecToGraphqlScalar', () => {
  it.each([
    ['pg/text@1', 'String'],
    ['pg/varchar@1', 'String'],
    ['sql/text@1', 'String'],
    ['pg/int4@1', 'Int'],
    ['pg/int2@1', 'Int'],
    ['sql/int@1', 'Int'],
    ['pg/int8@1', 'BigInt'],
    ['pg/float8@1', 'Float'],
    ['pg/float4@1', 'Float'],
    ['pg/bool@1', 'Boolean'],
    ['pg/timestamptz-temporal@1', 'DateTime'],
    ['pg/timestamp-temporal@1', 'DateTime'],
    ['pg/date-temporal@1', 'DateTime'],
    ['pg/numeric@1', 'Decimal'],
    ['pg/json@1', 'Json'],
    ['pg/bytea@1', 'Bytes'],
  ])('maps %s to %s', (codecId, expected) => {
    expect(codecToGraphqlScalar(codecId)).toBe(expected)
  })

  it('throws on unknown codecs instead of silently generating wrong types', () => {
    expect(() => codecToGraphqlScalar('pg/vector@1')).toThrow(/codec/i)
  })
})

describe('toSchemaModel (simple fixture)', () => {
  let schema!: SchemaModel

  beforeAll(async () => {
    schema = toSchemaModel(await loadContractFile(simpleContractPath))
  })

  it('extracts models with scalar fields', () => {
    expect(schema.target).toBe('postgres')
    expect(schema.models.map((m) => m.name).sort()).toEqual(['Post', 'User'])

    const user = schema.models.find((m) => m.name === 'User')!
    expect(user.namespace).toBe('public')
    expect(user.table).toBe('User')
    expect(user.primaryKey).toEqual(['id'])
    expect(user.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', graphqlScalar: 'Int', nullable: false }),
        expect.objectContaining({ name: 'firstName', graphqlScalar: 'String', nullable: false }),
        expect.objectContaining({ name: 'createdAt', graphqlScalar: 'DateTime', nullable: false }),
        expect.objectContaining({ name: 'updatedAt', graphqlScalar: 'DateTime', nullable: true }),
      ]),
    )
  })

  it('extracts relations with cardinality', () => {
    const user = schema.models.find((m) => m.name === 'User')!
    expect(user.relations).toEqual([
      expect.objectContaining({
        name: 'posts',
        targetModel: 'Post',
        cardinality: '1:N',
      }),
    ])

    const post = schema.models.find((m) => m.name === 'Post')!
    expect(post.relations).toEqual([
      expect.objectContaining({
        name: 'author',
        targetModel: 'User',
        cardinality: 'N:1',
        nullable: false,
      }),
    ])
  })
})

describe('toSchemaModel (complex fixture)', () => {
  let schema!: SchemaModel

  beforeAll(async () => {
    schema = toSchemaModel(await loadContractFile(complexContractPath))
  })

  const modelOf = (name: string) => schema.models.find((m) => m.name === name)!

  it('detects enum-typed fields via valueSet and extracts enum defs', () => {
    expect(schema.enums).toEqual([{ name: 'Role', namespace: 'public', members: ['USER', 'ADMIN'] }])

    expect(modelOf('User').fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'role', graphqlScalar: 'String', enumName: 'Role' })]),
    )
  })

  it('maps every WithScalars codec to the right GraphQL scalar', () => {
    const byName = Object.fromEntries(modelOf('WithScalars').fields.map((f) => [f.name, f.graphqlScalar]))
    expect(byName).toMatchObject({
      string: 'String',
      boolean: 'Boolean',
      int: 'Int',
      float: 'Float',
      decimal: 'Decimal',
      bigint: 'BigInt',
      datetime: 'DateTime',
      json: 'Json',
      bytes: 'Bytes',
    })
  })

  it('supports composite primary keys (Follow)', () => {
    expect(modelOf('Follow').primaryKey).toEqual(['fromId', 'toId'])
  })

  it('supports models without primary key (WithoutID)', () => {
    expect(modelOf('WithoutID').primaryKey).toBeNull()
    expect(modelOf('WithoutID').uniques).toEqual([['name']])
  })

  it('extracts single-column uniques (Profile.userId)', () => {
    expect(modelOf('Profile').uniques).toEqual([['userId']])
  })

  it('extracts 1:1 relations (User.Profile)', () => {
    expect(modelOf('User').relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Profile',
          targetModel: 'Profile',
          cardinality: '1:1',
          nullable: true,
        }),
      ]),
    )
  })
})
