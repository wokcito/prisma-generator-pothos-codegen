import path from 'node:path'
import { loadContractFile } from '../contract/loader'
import { type SchemaModel, toSchemaModel } from '../contract/schema'
import { getDefaultConfig } from '../utils/config'
import { type GeneratedFile, generateCrud } from '.'

const complexContractPath = path.join(__dirname, '../contract/fixtures/complex/generated/contract.json')

describe('generateCrud (Prisma 8 + @pothos/plugin-prisma-next)', () => {
  let schema!: SchemaModel
  let files!: GeneratedFile[]

  beforeAll(async () => {
    schema = toSchemaModel(await loadContractFile(complexContractPath))
    files = generateCrud(schema, getDefaultConfig())
  })

  const contentOf = (filePath: string) => files.find((f) => f.path === filePath)!.content

  it('generates root files and one module per model', () => {
    const paths = files.map((f) => f.path)

    expect(paths).toEqual(expect.arrayContaining(['objects.ts', 'utils.ts', 'autocrud.ts']))
    for (const model of ['User', 'Post', 'Comment']) {
      expect(paths).toEqual(
        expect.arrayContaining([`${model}/object.base.ts`, `${model}/queries.ts`, `${model}/mutations.ts`]),
      )
    }
  })

  it('emits prismaObject types with exposed scalars and relations', () => {
    const userObject = contentOf('User/object.base.ts')

    expect(userObject).toContain(`builder.prismaObject('User'`)
    expect(userObject).toContain(`t.exposeID('id')`)
    expect(userObject).toContain(`t.exposeString('firstName')`)
    expect(userObject).toContain(`posts: t.relation('posts'`)
    expect(userObject).toContain(`type: Inputs.Role`)
    expect(userObject).not.toContain('definePrismaObject')
    expect(userObject).not.toContain('@pothos/plugin-prisma')

    expect(contentOf('Post/object.base.ts')).toContain(`author: t.relation('author')`)
  })

  it('emits queries against the Prisma 8 collection API', () => {
    const queries = contentOf('User/queries.ts')

    expect(queries).toContain('t.prismaField')
    expect(queries).toContain('_context.db.orm.public.User')
    expect(queries).toContain('.limit(')
    expect(queries).toContain('.offset(')
    expect(queries).not.toMatch(/\btake\b/)
    expect(queries).not.toMatch(/\bskip\b/)
    expect(queries).not.toContain('...query')
  })

  it('emits mutations that write and return a collection', () => {
    const mutations = contentOf('User/mutations.ts')

    for (const op of ['createOne', 'updateOne', 'deleteOne', 'upsertOne']) {
      expect(mutations).toContain(op)
    }
    expect(mutations).toContain('.create(')
    expect(mutations).toContain('_context.db.orm.public.User')
    expect(mutations).not.toContain('...query')
  })

  it('generates utils without the Prisma 7 plugin dependency', () => {
    const utils = contentOf('utils.ts')

    expect(utils).toContain('@pothos/core')
    expect(utils).not.toContain('@pothos/plugin-prisma')
  })

  it('respects disabled crud and resolver exclusions', () => {
    const disabled = getDefaultConfig()
    disabled.crud.disabled = true
    expect(generateCrud(schema, disabled)).toEqual([])

    const excluded = getDefaultConfig()
    excluded.crud.excludeResolversContain = ['User']
    const autocrud = generateCrud(schema, excluded).find((f) => f.path === 'autocrud.ts')!.content
    expect(autocrud).not.toContain('User:')
  })
})
