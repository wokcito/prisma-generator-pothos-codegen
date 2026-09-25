import type { ExposureConfig, ExposureOperation } from '../../src/utils/config'
import { normalizeExposure } from '../../src/utils/exposureConfig'
import { getExposureReport } from '../../src/utils/manifest'
import { exposureDMMF, file, generateExposure, withAllModels } from '../helpers/exposureHelpers'
import { generateAll } from '../helpers/helpers'
import { getDefinedExports, getExportBlock, getIndexObjectExports, getObjectFieldNames } from '../helpers/parse'

const gen = generateExposure

const ALL_MODELS = [
  'User',
  'Post',
  'Comment',
  'AuthToken',
  'AppClientAuth',
  'AuditLog',
  'Pair',
  'Typed',
  'Bridge',
  'Omitted',
]
const readOnly: ExposureConfig = { operations: ['findMany', 'findUnique', 'count'] }
const reads: ExposureOperation[] = ['findMany', 'findUnique', 'findFirst', 'count']

describe('operations', () => {
  it('a read-only global: findMany, findUnique and count exist, no mutations', async () => {
    const files = await gen(readOnly)
    for (const model of ALL_MODELS) {
      expect(files[`generated/${model}/queries/findMany.base.ts`]).toBeDefined()
      expect(files[`generated/${model}/queries/findUnique.base.ts`]).toBeDefined()
      expect(files[`generated/${model}/queries/count.base.ts`]).toBeDefined()
      expect(files[`generated/${model}/queries/findFirst.base.ts`]).toBeUndefined()
      expect(files[`generated/${model}/mutations/index.ts`]).toBeUndefined()
      expect(files[`generated/${model}/mutations/createOne.base.ts`]).toBeUndefined()
    }
  })

  it('an enabled mutation is generated', async () => {
    const files = await gen({ operations: ['findMany', 'createOne', 'updateOne'] })
    const auto = file(files, 'autocrud.ts')
    expect(auto).toContain('createOne: Post.createOnePostMutationObject')
    expect(auto).toContain('updateOne: Post.updateOnePostMutationObject')
    expect(auto).not.toContain('deleteOne: Post')
    expect(files['generated/Post/mutations/createOne.base.ts']).toBeDefined()
  })

  it('operations: [] in a model removes everything from it, and a model nobody reaches is not generated', async () => {
    const files = await gen({ models: { AuditLog: { operations: [] } } })
    expect(Object.keys(files).filter((name) => name.includes('AuditLog'))).toEqual([])
    expect(file(files, 'autocrud.ts')).not.toContain('AuditLog')
    expect(file(files, 'objects.ts')).not.toContain('AuditLog')
    expect(file(files, 'inputs.ts')).not.toContain('AuditLog')
    expect(JSON.parse(file(files, 'exposure.manifest.json')).models.AuditLog).toBeUndefined()
    expect(files['generated/Post/queries/findMany.base.ts']).toBeDefined()
  })

  it('a model that is not in exposure.models has no operations when operations are used', async () => {
    const files = await gen({ operations: ['findMany'], models: { User: {} } }, {}, { allModels: false })
    expect(files['generated/User/queries/findMany.base.ts']).toBeDefined()
    // Post is reached by the visible relation User.posts (its object exists) but it has no operations
    expect(file(files, 'Post/object.base.ts')).toContain("definePrismaObject('Post'")
    expect(files['generated/Post/queries/findMany.base.ts']).toBeUndefined()
    // Reached through visible relations: User.posts, User.tokens, Post.comments, Post.bridges
    const manifest = Object.keys(JSON.parse(file(files, 'exposure.manifest.json')).models)
    expect(manifest).toEqual(['User', 'Post', 'Comment', 'AuthToken', 'Bridge'])
    expect(files['generated/Comment/queries/findMany.base.ts']).toBeUndefined()
    // Nothing reaches these: they do not exist at all
    for (const model of ['AppClientAuth', 'AuditLog', 'Pair', 'Typed', 'Omitted'])
      expect(Object.keys(files).filter((name) => name.includes(`/${model}/`) || name.endsWith(`/${model}`))).toEqual([])
    expect(file(files, 'inputs.ts')).not.toMatch(/AppClientAuth|AuditLog|TypedWhereInput|OmittedWhereInput/)
  })

  it('a hidden relation does not make its target reachable', async () => {
    const files = await gen(
      { operations: ['findMany'], models: { User: { fields: { posts: 'hidden', tokens: 'hidden' } } } },
      {},
      { allModels: false },
    )
    expect(Object.keys(files).some((name) => name.includes('/Post/'))).toBe(false)
    expect(Object.keys(files).some((name) => name.includes('/AuthToken/'))).toBe(false)
  })

  it('without operations every model is still generated (the excludeResolvers* options decide)', async () => {
    const files = await gen({ maxTake: 5 }, {}, { allModels: false })
    for (const model of ALL_MODELS) expect(files[`generated/${model}/object.base.ts`], model).toBeDefined()
  })

  it('{ count: [] } in a model leaves only count', async () => {
    const files = await gen({
      operations: { findMany: [], createOne: [] },
      models: { Post: { operations: { count: [] } } },
    })
    const post = Object.keys(files).filter((n) => /Post\/(queries|mutations)\/\w+\.base\.ts/.test(n))
    expect(post).toEqual(['generated/Post/queries/count.base.ts'])
  })

  it('inherit with a change of tag', async () => {
    const files = await gen({
      operations: { findMany: 'a', count: 'a' },
      models: { Post: { operations: { inherit: true, findMany: 'canRead' } } },
    })
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain("tags: ['canRead']")
    expect(file(files, 'Post/queries/count.base.ts')).toContain("tags: ['a']")
    expect(file(files, 'User/queries/findMany.base.ts')).toContain("tags: ['a']")
  })

  it('the tags reach the target of every generated operation, in order', async () => {
    const files = await gen({
      operations: { findMany: ['loggedIn', 'canRead'], createOne: 'canWrite', deleteMany: ['a', 'b', 'c'] },
    })
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain(
      "const target = { kind: 'query', model: 'Post', operation: 'findMany', tags: ['loggedIn', 'canRead'] } as const;",
    )
    expect(file(files, 'Post/mutations/createOne.base.ts')).toContain(
      "const target = { kind: 'mutation', model: 'Post', operation: 'createOne', tags: ['canWrite'] } as const;",
    )
    expect(file(files, 'Post/mutations/deleteMany.base.ts')).toContain("tags: ['a', 'b', 'c']")
  })

  it('a model without operations still exists as an object if a relation reaches it', async () => {
    const files = await gen({ models: { Comment: { operations: [] } } })
    expect(file(files, 'Comment/object.base.ts')).toContain("definePrismaObject('Comment'")
    expect(file(files, 'autocrud.ts')).toContain('Comment: {\n    Object: Comment.CommentObject,')
    expect(file(files, 'objects.ts')).toContain('CommentObject')
  })

  it('autocrud.ts lists exactly the enabled operations', async () => {
    const files = await gen({
      operations: ['findMany', 'count', 'updateMany'],
      models: { Post: { operations: ['findFirst'] } },
    })
    const auto = file(files, 'autocrud.ts')
    expect(auto).toMatch(
      /User: \{\n {4}Object: User\.UserObject,\n {4}queries: \{\n {6}findMany: User\.findManyUserQueryObject,\n {6}count: User\.countUserQueryObject,\n {4}\},\n {4}mutations: \{\n {6}updateMany: User\.updateManyUserMutationObject,\n {4}\},/,
    )
    expect(auto).toMatch(
      /Post: \{\n {4}Object: Post\.PostObject,\n {4}queries: \{\n {6}findFirst: Post\.findFirstPostQueryObject,\n {4}\},\n {4}mutations: \{\n\n {4}\},/,
    )
  })

  it('the index.ts of each model exports only what is enabled', async () => {
    const files = await gen({ operations: ['findMany'], models: { Post: { operations: ['createOne'] } } })
    expect(file(files, 'User/index.ts')).toContain("} from './queries';")
    expect(file(files, 'User/index.ts')).not.toContain('./mutations')
    expect(file(files, 'Post/index.ts')).toContain("} from './mutations';")
    expect(file(files, 'Post/index.ts')).not.toContain('./queries')
  })

  it('objects.ts is coherent with the index.ts files', async () => {
    const files = await gen({ operations: ['findMany'] })
    const objects = file(files, 'objects.ts')
    expect(objects).toContain('findManyUserQuery,')
    expect(objects).not.toContain('countUserQuery')
    expect(objects).not.toContain('createOneUserMutation')
  })

  it('generateAllQueries({ include }) keeps working', async () => {
    const auto = file(await gen(readOnly), 'autocrud.ts')
    expect(auto).toContain('export function generateAllQueries(opts?: CrudOptions)')
    expect(auto).toContain('return opts.include.includes(model as Model)')
  })

  it('handleResolver keeps working', async () => {
    const auto = file(await gen(readOnly), 'autocrud.ts')
    expect(auto).toContain('opts.handleResolver({')
    expect(auto).toContain('const isntPrismaFieldList = ["count", "deleteMany", "updateMany"]')
  })

  it('write operations with tags', async () => {
    const files = await gen({ operations: { updateOne: ['owner'], deleteOne: 'admin', createMany: [] } })
    expect(file(files, 'Post/mutations/updateOne.base.ts')).toContain("tags: ['owner']")
    expect(file(files, 'Post/mutations/deleteOne.base.ts')).toContain("tags: ['admin']")
    expect(file(files, 'Post/mutations/createMany.base.ts')).toContain('tags: []')
  })

  it('findFirst enabled only in one model', async () => {
    const files = await gen({
      operations: ['findMany'],
      models: { User: { operations: { inherit: true, findFirst: true } } },
    })
    expect(files['generated/User/queries/findFirst.base.ts']).toBeDefined()
    expect(files['generated/Post/queries/findFirst.base.ts']).toBeUndefined()
  })

  it('without exposure.operations, excludeResolvers* keep working as in 1.0.0', async () => {
    const files = await gen(
      { maxTake: 5 },
      { crud: { excludeResolversContain: ['AuditLog'], includeResolversExact: [] } },
    )
    expect(Object.keys(files).some((n) => n.includes('AuditLog/queries'))).toBe(false)
    expect(files['generated/Post/queries/findMany.base.ts']).toBeDefined()
  })

  it('a repeated tag warns and does not fail', async () => {
    const exposure = normalizeExposure({ operations: { findMany: ['a', 'a'] } }, await exposureDMMF())
    expect(exposure?.warnings).toHaveLength(1)
    const files = await gen({ operations: { findMany: ['a', 'a'] } })
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain("tags: ['a']")
  })

  it('the order of the tags is kept', async () => {
    const files = await gen({ operations: { findMany: ['z', 'a', 'm'] } })
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain("tags: ['z', 'a', 'm']")
  })

  it('count with maxTake is not limited', async () => {
    const files = await gen({ maxTake: 50, operations: ['count'] })
    const count = file(files, 'Post/queries/count.base.ts')
    expect(count).not.toContain('clampTake')
    expect(count).toContain('take: args.take || undefined')
  })

  it('without global operations every operation is generated, as in 1.0.0', async () => {
    const files = await gen({ maxTake: 50 })
    for (const op of ['findFirst', 'findMany', 'count', 'findUnique'])
      expect(files[`generated/Post/queries/${op}.base.ts`]).toBeDefined()
    for (const op of ['createMany', 'createOne', 'deleteMany', 'deleteOne', 'updateMany', 'updateOne', 'upsertOne'])
      expect(files[`generated/Post/mutations/${op}.base.ts`]).toBeDefined()
  })

  it('the report lists the models that are not generated', async () => {
    const dmmf = await exposureDMMF()
    const exposure = normalizeExposure({ operations: ['findMany'], models: { User: {} } }, dmmf)
    expect(getExposureReport(exposure as never)).toContain(
      'Models not generated (no operations, and no visible relation reaches them): AppClientAuth, AuditLog, Pair, Typed, Omitted',
    )
  })

  it('the report lists the models with the default exposure', async () => {
    const dmmf = await exposureDMMF()
    const exposure = normalizeExposure(
      withAllModels({ models: { User: { fields: { phone: 'guarded' } }, Post: { operations: ['findMany'] } } }, dmmf),
      dmmf,
    )
    const lines = getExposureReport(exposure as never)
    expect(lines[0]).toBe(
      'Models using default exposure: Comment, AuthToken, AppClientAuth, AuditLog, Pair, Typed, Bridge, Omitted',
    )
    expect(lines).toHaveLength(1)
  })
})

describe('objects', () => {
  const fields = {
    passwordHash: 'hidden',
    tokens: 'hidden',
    email: 'guarded',
    role: 'readonly',
    phone: 'unfilterable',
  } as const
  // `passwordHash` is required in Prisma: with it hidden, createOne can not work
  const generate = () => gen({ operations: reads, models: { User: { fields } } })

  it('a hidden scalar is not in the object nor in its FieldObject export', async () => {
    const object = file(await generate(), 'User/object.base.ts')
    expect(getObjectFieldNames(object)).not.toContain('passwordHash')
    expect(getDefinedExports(object)).not.toContain('UserPasswordHashFieldObject')
  })

  it('a hidden relation is not in the object', async () => {
    const object = file(await generate(), 'User/object.base.ts')
    expect(getObjectFieldNames(object)).not.toContain('tokens')
    expect(getObjectFieldNames(object)).toContain('posts')
  })

  it('nothing of the hidden fields is left in the generated code, comments included', async () => {
    const files = await generate()
    for (const [name, content] of Object.entries(files)) {
      if (!name.includes('User/') && !name.endsWith('inputs.ts')) continue
      expect(content, name).not.toMatch(/passwordHash/i)
    }
  })

  it('a guarded scalar is nullable even if Prisma requires it', async () => {
    const block = getExportBlock(file(await generate(), 'User/object.base.ts'), 'UserEmailFieldObject')
    expect(block).toContain('nullable: true')
  })

  it('a guarded scalar asks the runtime with the model and the field', async () => {
    const object = file(await generate(), 'User/object.base.ts')
    expect(getExportBlock(object, 'UserEmailFieldObject')).toContain(
      "resolve: (parent, _args, ctx) => (canReadField({ model: 'User', field: 'email' }, parent, ctx) ? parent.email : null),",
    )
    expect(object).toContain(
      "import { canReadField, mergeScope } from '@wokcito/prisma-generator-pothos-codegen/runtime';\nimport '../exposure';",
    )
  })

  it('a field without state is the same as in 1.0.0', async () => {
    const withExposure = await generate()
    const plain = await generateAll({}, await exposureDMMF())
    for (const name of ['User', 'Post']) {
      const a = getExportBlock(
        file(withExposure, `${name}/object.base.ts`),
        `${name}TitleFieldObject`.replace('UserTitle', 'UserTokenCount'),
      )
      const b = getExportBlock(
        file(plain, `${name}/object.base.ts`),
        `${name}TitleFieldObject`.replace('UserTitle', 'UserTokenCount'),
      )
      expect(a).toBe(b)
    }
    expect(getExportBlock(file(withExposure, 'User/object.base.ts'), 'UserTokenCountFieldObject')).toBe(
      getExportBlock(file(plain, 'User/object.base.ts'), 'UserTokenCountFieldObject'),
    )
  })

  it('a guarded @id with mapIdFieldsToGraphqlId keeps the ID mapping', async () => {
    const files = await gen({ models: { User: { fields: { id: 'guarded' } } } })
    const block = getExportBlock(file(files, 'User/object.base.ts'), 'UserIdFieldObject')
    expect(block).toContain('type: "ID"')
    expect(block).toContain('? String(parent.id) : null')
  })

  it('readonly and unfilterable do not change the object', async () => {
    const files = await generate()
    const plain = await generateAll({}, await exposureDMMF())
    for (const name of ['UserRoleFieldObject', 'UserPhoneFieldObject'])
      expect(getExportBlock(file(files, 'User/object.base.ts'), name)).toBe(
        getExportBlock(file(plain, 'User/object.base.ts'), name),
      )
  })

  it('hidden fields are also out of the index.ts and of objects.ts', async () => {
    const files = await generate()
    expect(getIndexObjectExports(file(files, 'User/index.ts'))).not.toContain('UserPasswordHashFieldObject')
    expect(file(files, 'objects.ts')).not.toContain('UserPasswordHashFieldObject')
    expect(file(files, 'objects.ts')).not.toContain('UserTokensFieldObject')
    expect(getIndexObjectExports(file(files, 'User/index.ts'))).toContain('UserEmailFieldObject')
  })

  it('underscoreBetweenObjectVariableNames with states', async () => {
    const files = await gen(
      {
        operations: reads,
        models: { User: { fields: { ...fields, id: 'guarded' } }, Post: { fields: { author: 'guarded' } } },
      },
      { crud: { underscoreBetweenObjectVariableNames: 'Objects' } },
    )
    const defined = getDefinedExports(file(files, 'User/object.base.ts'))
    expect(defined).toContain('User_Email_FieldObject')
    expect(defined).not.toContain('User_PasswordHash_FieldObject')
    const post = file(files, 'Post/object.base.ts')
    expect(post).toContain('export const Post_Author_FieldObject = defineGuardedRelationObject(')
    expect(post).toContain('author: Post_Author_FieldObject(t),')
    expect(getIndexObjectExports(file(files, 'User/index.ts'))).toEqual(
      defined.filter((n) => n.endsWith('Object') && !n.endsWith('FieldArgs')),
    )
  })

  it('a hidden list relation generates no FieldArgs nor query', async () => {
    const object = file(await gen({ models: { Post: { fields: { comments: 'hidden' } } } }), 'Post/object.base.ts')
    expect(object).not.toContain('PostCommentsFieldArgs')
    expect(object).not.toContain("'comments'")
    expect(object).toContain('PostBridgesFieldArgs')
  })

  it('a guarded to-one relation is nullable and checked against the scope of its target', async () => {
    const files = await gen(
      { models: { Post: { fields: { author: 'guarded' } } } },
      { crud: { prismaCaller: 'db', resolverImports: "\nimport { db } from '@/db';" } },
    )
    const post = file(files, 'Post/object.base.ts')
    expect(post).toContain("import { db } from '@/db';")
    expect(
      getExportBlock(post, 'PostAuthorFieldObject').trimEnd(),
    ).toBe(`export const PostAuthorFieldObject = defineGuardedRelationObject('Post', 'author', 'User', {
  description: undefined,
  isReadable: (row, _context) =>
    isRowReadable(
      { kind: 'relation', model: 'Post', field: 'author', targetModel: 'User', isList: false },
      row,
      _context,
      { key: 'id', find: (where) => db.user.findMany({ where, select: { id: true } }) },
    ),
});`)
    expect(getObjectFieldNames(post)).toContain('author')
    expect(file(files, 'utils.ts')).toContain('export const defineGuardedRelationObject = <')
    // Without a guarded relation there are no resolver imports in the object file
    expect(
      file(
        await gen(
          { models: { Post: { fields: { title: 'guarded' } } } },
          { crud: { resolverImports: "\nimport { db } from '@/db';" } },
        ),
        'Post/object.base.ts',
      ),
    ).not.toContain('@/db')
  })
})

describe('maxTake', () => {
  it('the global one applies to findMany in every model', async () => {
    const files = await gen({ maxTake: 50 })
    for (const model of ALL_MODELS)
      expect(file(files, `${model}/queries/findMany.base.ts`)).toContain('take: clampTake(args.take, 50),')
  })

  it('the one of a model has priority', async () => {
    const files = await gen({ maxTake: 50, models: { Post: { maxTake: 10 } } })
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain('take: clampTake(args.take, 10),')
    expect(file(files, 'User/queries/findMany.base.ts')).toContain('take: clampTake(args.take, 50),')
  })

  it('it applies to list relations, with the one of the target model', async () => {
    const files = await gen({ maxTake: 50, models: { Post: { maxTake: 10 }, User: { maxTake: 7 } } })
    expect(getExportBlock(file(files, 'User/object.base.ts'), 'UserPostsFieldObject')).toContain(
      'take: clampTake(args.take, 10),',
    )
    expect(getExportBlock(file(files, 'Post/object.base.ts'), 'PostCommentsFieldObject')).toContain(
      'take: clampTake(args.take, 50),',
    )
  })

  it('count has no cap', async () => {
    const files = await gen({ maxTake: 50 })
    expect(file(files, 'Post/queries/count.base.ts')).not.toContain('clampTake')
  })

  it('findFirst and findUnique do not send take (Prisma only accepts 1 or -1 in findFirst)', async () => {
    const files = await gen({ maxTake: 50 })
    expect(file(files, 'Post/queries/findFirst.base.ts')).toContain('take: args.take || undefined,')
    expect(file(files, 'Post/queries/findFirst.base.ts')).not.toContain('clampTake')
    expect(file(files, 'Post/queries/findUnique.base.ts')).not.toContain('take')
  })

  it('skip and cursor are passed unchanged', async () => {
    const findMany = file(await gen({ maxTake: 50 }), 'Post/queries/findMany.base.ts')
    expect(findMany).toContain('cursor: args.cursor || undefined,')
    expect(findMany).toContain('skip: args.skip || undefined,')
  })

  it('without maxTake the resolver has no clampTake', async () => {
    const files = await gen({ operations: ['findMany'] })
    expect(file(files, 'Post/queries/findMany.base.ts')).not.toContain('clampTake')
    expect(file(files, 'User/object.base.ts')).not.toContain('clampTake')
  })

  it('the expression is the call to the runtime clampTake', async () => {
    const files = await gen({ maxTake: 50 })
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain(
      "import { clampTake, mergeScope, withExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';",
    )
  })
})

describe('generated code', () => {
  it('findMany goes through withExposure, mergeScope and clampTake', async () => {
    const findMany = file(
      await gen({ maxTake: 50, operations: { findMany: 'canRead' } }),
      'Post/queries/findMany.base.ts',
    )
    expect(findMany).toContain(`export const findManyPostQueryObject = defineQueryFunction((t) => {
  const target = { kind: 'query', model: 'Post', operation: 'findMany', tags: ['canRead'] } as const;

  const operation = defineQueryPrismaObject({
    type: ['Post'],
    nullable: false,
    args: findManyPostQueryArgs,
    resolve: async (query, _root, args, _context, _info) =>
      await _context.prisma.post.findMany({
        where: mergeScope(target, args, _context),
        cursor: args.cursor || undefined,
        take: clampTake(args.take, 50),
        distinct: args.distinct || undefined,
        skip: args.skip || undefined,
        orderBy: args.orderBy || undefined,
        ...query,
      }),
  });

  return { ...operation, resolve: withExposure(target, operation.resolve, { flat: false }) };
},
);`)
  })

  it('findFirst has no clampTake', async () => {
    const findFirst = file(await gen({ maxTake: 50 }), 'Post/queries/findFirst.base.ts')
    expect(findFirst).toContain('where: mergeScope(target, args, _context),')
    expect(findFirst).not.toContain('clampTake')
    expect(findFirst).toContain(
      "import { mergeScope, withExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';",
    )
  })

  it('findUnique uses the unique shape (mergeScope keeps the key on top)', async () => {
    const findUnique = file(await gen({}), 'Post/queries/findUnique.base.ts')
    expect(findUnique).toContain('findUnique({ where: mergeScope(target, args, _context), ...query })')
  })

  it('count has scope and no take, and it is a flat field', async () => {
    const count = file(await gen({}), 'Post/queries/count.base.ts')
    expect(count).toContain('async (_root, args, _context, _info) =>')
    expect(count).toContain('where: mergeScope(target, args, _context),')
    expect(count).toContain('{ flat: true }')
    expect(count).not.toContain('clampTake')
  })

  it('mutations have guards, update/delete are scoped and create is not', async () => {
    const files = await gen({})
    for (const op of ['updateOne', 'updateMany', 'deleteOne', 'deleteMany'])
      expect(file(files, `Post/mutations/${op}.base.ts`)).toContain('mergeScope(target, args, _context)')
    for (const op of ['createOne', 'createMany', 'upsertOne']) {
      const code = file(files, `Post/mutations/${op}.base.ts`)
      expect(code).not.toContain('mergeScope')
      expect(code).toContain("import { withExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';")
      expect(code).toContain('withExposure(target, operation.resolve')
    }
    expect(file(files, 'Post/mutations/upsertOne.base.ts')).toContain('where: args.where,')
  })

  it('the runtime imports are only where they are used', async () => {
    const files = await gen({ operations: ['findMany', 'createOne'] })
    expect(file(files, 'Post/mutations/createOne.base.ts')).not.toContain('mergeScope')
    // Post has a list relation (scoped by mergeScope), Comment only a to-one relation and scalars
    expect(file(files, 'Post/object.base.ts')).toContain(
      "import { mergeScope } from '@wokcito/prisma-generator-pothos-codegen/runtime';",
    )
    expect(file(files, 'Comment/object.base.ts')).not.toContain('@wokcito')
  })

  it('the target has kind, model, operation and tags', async () => {
    const code = file(await gen({ operations: { deleteOne: 'a' } }), 'User/mutations/deleteOne.base.ts')
    expect(code).toContain("{ kind: 'mutation', model: 'User', operation: 'deleteOne', tags: ['a'] }")
  })

  it('withExposure wraps the object of the operation, inherited by the operation itself', async () => {
    const code = file(await gen({}), 'Post/queries/findMany.base.ts')
    expect(code).toContain('export const findManyPostQueryObject = defineQueryFunction((t) => {')
    expect(code).toContain(
      'export const findManyPostQuery = defineQuery((t) => ({\n  findManyPost: t.prismaField(findManyPostQueryObject(t)),',
    )
  })

  it('flat: true in count/deleteMany/updateMany and false in the rest', async () => {
    const files = await gen({})
    const flat: Record<string, boolean> = {}
    for (const [name, content] of Object.entries(files)) {
      const match = /^generated\/Post\/(?:queries|mutations)\/(\w+)\.base\.ts$/.exec(name)
      if (match) flat[match[1] as string] = content.includes('{ flat: true }')
    }
    expect(flat).toEqual({
      count: true,
      deleteMany: true,
      updateMany: true,
      findFirst: false,
      findMany: false,
      findUnique: false,
      createMany: false,
      createOne: false,
      deleteOne: false,
      updateOne: false,
      upsertOne: false,
    })
    // The same list as autocrud.ts
    expect(file(files, 'autocrud.ts')).toContain('["count", "deleteMany", "updateMany"]')
  })

  it('exposure.ts registers the manifest', async () => {
    const exposure = file(await gen({ maxTake: 5 }), 'exposure.ts')
    expect(
      exposure.startsWith("import { registerManifest } from '@wokcito/prisma-generator-pothos-codegen/runtime';"),
    ).toBe(true)
    expect(exposure).toContain('registerManifest({\n  "version": 1,')
  })

  it('exposure.ts re-exports configureExposure, byTag and assertExposureConfigured', async () => {
    expect(file(await gen({}), 'exposure.ts')).toContain(
      "export { assertExposureConfigured, byTag, configureExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';",
    )
  })

  it('objects.ts and autocrud.ts import exposure.ts for its effect, and every file that uses the runtime does', async () => {
    const files = await gen({})
    expect(file(files, 'objects.ts')).toContain("\nimport './exposure';")
    expect(file(files, 'autocrud.ts')).toContain("\nimport './exposure';")
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain("import '../../exposure';")
    expect(file(files, 'Comment/object.base.ts')).not.toContain('exposure') // no runtime use in it
    expect(file(files, 'Post/object.base.ts')).toContain("import '../exposure';")
  })

  it('the generated code only imports Prisma, Pothos, the runtime and the imports of the user', async () => {
    const files = await gen(
      { maxTake: 5, models: { User: { fields: { email: 'guarded' } } } },
      { crud: { resolverImports: "\nimport { db } from '@/db';" } },
    )
    const allowed =
      /^(?:\.{1,2}\/|@wokcito\/prisma-generator-pothos-codegen\/runtime$|@pothos\/|@prisma\/|\.prisma\/client$|@\/db$)/
    for (const [name, content] of Object.entries(files)) {
      if (name.endsWith('.json')) continue
      for (const match of content.matchAll(/^(?:import|export)\b[^;]*?from '([^']+)'/gms))
        expect(match[1], `${name}`).toMatch(allowed)
      for (const match of content.matchAll(/^import '([^']+)'/gm)) expect(match[1], name).toMatch(allowed)
    }
    expect(Object.values(files).join('\n')).not.toMatch(/casl|passport|next-auth|@auth|jsonwebtoken|graphql-shield/i)
  })

  it('mapIdFieldsToGraphqlId with withExposure', async () => {
    const files = await gen({}, { crud: { mapIdFieldsToGraphqlId: false } })
    expect(getExportBlock(file(files, 'Post/object.base.ts'), 'PostIdFieldObject')).toContain('type: "Int"')
  })

  it('underscoreBetweenObjectVariableNames with withExposure', async () => {
    const files = await gen({ maxTake: 5 }, { crud: { underscoreBetweenObjectVariableNames: 'Objects' } })
    expect(file(files, 'User/object.base.ts')).toContain('const User_Posts_FieldObjectTarget')
    expect(file(files, 'User/object.base.ts')).toContain('mergeScope(User_Posts_FieldObjectTarget')
  })

  it('a custom prismaCaller (_context.prisma) is used by the resolvers', async () => {
    const files = await gen({ maxTake: 5 }, { crud: { prismaCaller: '_context.db' } })
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain('await _context.db.post.findMany({')
  })

  it('the resolverImports of the user are kept', async () => {
    const files = await gen({ maxTake: 5 }, { crud: { resolverImports: "\nimport { db } from '@/db';" } })
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain("import { db } from '@/db';")
  })

  it('the global and crud replacers still apply to every file', async () => {
    const files = await gen(
      {},
      {
        global: { replacer: (str) => str.replaceAll('mergeScope', 'MERGE') },
        crud: { replacer: (str) => str.replaceAll('withExposure', 'WRAP') },
      },
    )
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain('MERGE(target')
    expect(file(files, 'Post/queries/findMany.base.ts')).toContain('WRAP(target')
    expect(file(files, 'exposure.types.ts')).toBeDefined()
    expect(file(files, 'exposure.ts')).not.toContain('registerManifest'.replace('register', 'WRAP'))
  })

  it('a list relation query is (args, ctx) and synchronous', async () => {
    const block = getExportBlock(file(await gen({}), 'User/object.base.ts'), 'UserPostsFieldObject')
    expect(block).toContain('query: (args, ctx) => ({')
    expect(block).not.toContain('async')
  })

  it('the list relation calls mergeScope with a constant RelationTarget', async () => {
    const object = file(await gen({}), 'User/object.base.ts')
    expect(object).toContain(
      "const UserPostsFieldObjectTarget = { kind: 'relation', model: 'User', field: 'posts', targetModel: 'Post', isList: true } as const;",
    )
    expect(object).toContain('where: mergeScope(UserPostsFieldObjectTarget, args, ctx),')
  })

  it('the list relation uses the maxTake of the target model', async () => {
    const object = file(await gen({ models: { Post: { maxTake: 3 } } }), 'User/object.base.ts')
    expect(object).toContain('take: clampTake(args.take, 3),')
  })

  it('a to-one relation without state is the same as in 1.0.0', async () => {
    const withExposure = await gen({ maxTake: 5 })
    const plain = await generateAll({}, await exposureDMMF())
    expect(getExportBlock(file(withExposure, 'Post/object.base.ts'), 'PostAuthorFieldObject')).toBe(
      getExportBlock(file(plain, 'Post/object.base.ts'), 'PostAuthorFieldObject'),
    )
  })

  it('a hidden list relation generates nothing', async () => {
    const files = await gen({ models: { Post: { fields: { comments: 'hidden' } } } })
    expect(file(files, 'Post/object.base.ts')).not.toMatch(/comments/i)
  })

  it('a guarded field of type list, enum and DateTime asks canReadField with { model, field }', async () => {
    const files = await gen({
      models: { User: { fields: { role: 'guarded', createdAt: 'guarded', data: 'guarded' } } },
    })
    const object = file(files, 'User/object.base.ts')
    for (const field of ['role', 'createdAt', 'data'])
      expect(object).toContain(
        `canReadField({ model: 'User', field: '${field}' }, parent, ctx) ? parent.${field} : null`,
      )
    expect(getExportBlock(object, 'UserRoleFieldObject')).toContain('type: Inputs.Role')
    expect(getExportBlock(object, 'UserCreatedAtFieldObject')).toContain('type: Inputs.DateTime')
  })

  it('a guarded @id', async () => {
    const files = await gen({ models: { Pair: { fields: { a: 'guarded' } } } })
    expect(getExportBlock(file(files, 'Pair/object.base.ts'), 'PairAFieldObject')).toContain('nullable: true')
  })

  it('exposure files: not emitted without exposure, emitted with it', async () => {
    const without = await generateAll({}, await exposureDMMF())
    for (const name of ['exposure.ts', 'exposure.types.ts', 'exposure.manifest.json'])
      expect(without[`generated/${name}`]).toBeUndefined()
    expect(without['generated/utils.ts']).not.toContain('defineGuardedRelationObject')
    expect(without['generated/utils.ts']).not.toContain('FieldRef')
    expect(Object.values(without).join('')).not.toContain('@wokcito/prisma-generator-pothos-codegen/runtime')

    const withExposure = await gen({})
    for (const name of ['exposure.ts', 'exposure.types.ts', 'exposure.manifest.json'])
      expect(withExposure[`generated/${name}`]).toBeDefined()
  })

  it('replacing resolve of a generated operation loses the wrapper (documented)', async () => {
    // The wrapper is applied to `operation.resolve` inside the generated object: whoever spreads the object and
    // overrides `resolve` has to call withExposure again
    const code = file(await gen({}), 'Post/queries/findMany.base.ts')
    expect(code).toContain('return { ...operation, resolve: withExposure(')
  })
})
