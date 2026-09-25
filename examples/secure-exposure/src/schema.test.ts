import fs from 'node:fs'
import path from 'node:path'
import { assertExposureConfigured, type ExposureManifest, registerManifest, resetExposureForTests } from '@wokcito/prisma-generator-pothos-codegen/runtime'
import { printSchema } from 'graphql'
import { schema } from './schema'
import { setupSecurity } from './security'

const manifest: ExposureManifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'schema/__generated__/exposure.manifest.json'), 'utf-8'),
)

afterEach(() => {
  resetExposureForTests()
  registerManifest(manifest)
  setupSecurity()
})

describe('the example app', () => {
  it('imports nothing but the runtime, Prisma, Pothos and GraphQL (no authorization library)', () => {
    const files = ['security.ts', 'context.ts', 'schema/builder.ts', 'schema/index.ts']
    const allowed = /^(?:\.{1,2}\/|@wokcito\/prisma-generator-pothos-codegen\/runtime$|@pothos\/|@prisma\/|graphql$)/
    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf-8')
      for (const [, from] of source.matchAll(/from '([^']+)'/g)) expect(from, file).toMatch(allowed)
    }
    const generated = fs.readFileSync(path.join(__dirname, 'schema/__generated__/User/queries/findMany.base.ts'), 'utf-8')
    for (const [, from] of generated.matchAll(/from '([^']+)'/g)) expect(from).toMatch(/^(?:\.{1,2}\/|@wokcito\/prisma-generator-pothos-codegen\/runtime$|@pothos\/|@prisma\/|@\/)/)
  })
})

describe('the generated schema', () => {
  const sdl = printSchema(schema)
  const block = (name: string) => new RegExp(`(?:type|input|enum) ${name} \\{[^}]*\\}`).exec(sdl)?.[0] ?? ''

  it('has no passwordHash, no phone in the filters and nullable email and author', () => {
    expect(sdl).not.toContain('passwordHash')
    expect(sdl).not.toContain('tokens')
    expect(block('User')).toMatch(/\n  email: String\n/)
    expect(block('User')).toMatch(/\n  phone: String\n/)
    expect(block('User')).toMatch(/\n  role: String!\n/)
    expect(block('Post')).toMatch(/\n  author: User\n/)
    expect(block('Post')).not.toContain('comments')
    for (const input of ['UserWhereInput', 'UserOrderByWithRelationInput', 'UserWhereUniqueInput']) expect(block(input)).not.toContain('phone')
    expect(block('UserWhereInput')).toContain('email:')
  })

  it('has exactly the operations of the config', () => {
    expect(Object.keys(schema.getQueryType()?.getFields() ?? {}).sort()).toEqual([
      'countPost',
      'findManyPost',
      'findManyUser',
      'findUniquePost',
      'findUniqueUser',
    ])
    expect(schema.getMutationType()).toBeUndefined()
  })

  it('builds, and lists no input of operations that do not exist', () => {
    for (const name of ['UserCreateInput', 'PostCreateInput', 'PostUpdateInput', 'CommentWhereInput', 'AuditLogWhereInput', 'AuthTokenWhereInput'])
      expect(schema.getType(name), name).toBeUndefined()
    // what is reached stays: the enums, the filters, the args of the list relations
    for (const name of ['SortOrder', 'UserScalarFieldEnum', 'PostWhereInput', 'PostOrderByWithRelationInput', 'StringFilter', 'DateTime'])
      expect(schema.getType(name), name).toBeDefined()
    expect(block('UserScalarFieldEnum') + sdl.match(/enum UserScalarFieldEnum \{[^}]*\}/)?.[0]).not.toContain('passwordHash')
    expect(sdl.match(/enum UserScalarFieldEnum \{[^}]*\}/)?.[0]).not.toContain('phone')
  })

  it('the models that are not in the config do not exist in the schema (not even as types in __schema)', () => {
    for (const name of ['Comment', 'AuthToken', 'AuditLog', 'CommentWhereInput', 'AuthTokenWhereInput'])
      expect(schema.getType(name), name).toBeUndefined()
    expect(schema.getType('Post')).toBeDefined()
    expect(schema.getType('User')).toBeDefined()
  })
})

describe('startup', () => {
  it('a typo in a tag fails at startup and names the tag', () => {
    resetExposureForTests()
    const typo = JSON.parse(JSON.stringify(manifest).replace(/canRead/g, 'canRed'))
    registerManifest(typo)
    expect(() => setupSecurity()).toThrow(/Tag "canRed" used by (User|Post)\.\w+ has no guard/)
  })

  it('guarded fields without configureExposure fail at startup', () => {
    resetExposureForTests()
    registerManifest(manifest)
    expect(() => assertExposureConfigured()).toThrow(/configureExposure was not called/)
    expect(() => setupSecurity()).not.toThrow()
    expect(() => assertExposureConfigured()).not.toThrow()
  })

  it('hidden / readonly / operations / maxTake alone need no runtime', () => {
    resetExposureForTests()
    const plain: ExposureManifest = JSON.parse(JSON.stringify(manifest))
    for (const model of Object.values(plain.models)) {
      for (const op of Object.keys(model.operations)) (model.operations as Record<string, string[]>)[op] = []
      for (const field of Object.values(model.fields)) field.states = field.states.filter((state) => state !== 'guarded')
    }
    registerManifest(plain)
    expect(() => assertExposureConfigured()).not.toThrow()
  })

  it('the manifest matches the config', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { crud } = require('./schema/configs.js')
    const { models, maxTake, operations } = crud.exposure
    for (const [name, model] of Object.entries(manifest.models)) expect(model.maxTake).toBe(maxTake)

    for (const [name, config] of Object.entries<any>(models)) {
      const fields = config.fields ?? {}
      for (const [field, states] of Object.entries<any>(fields)) {
        const expected = ([] as string[]).concat(states)
        expect([...(manifest.models[name]?.fields[field]?.states ?? [])].sort()).toEqual([...expected].sort())
      }
    }
    expect(manifest.models.User?.operations).toEqual({ findMany: operations.findMany, findUnique: operations.findUnique })
    expect(manifest.models.Post?.operations).toEqual({ findMany: ['canRead'], findUnique: ['canRead'], count: ['canRead'] })
    expect(Object.keys(manifest.models)).toEqual(['User', 'Post'])
  })
})
