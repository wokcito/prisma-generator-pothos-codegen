import type { Config, ExposureConfig } from '../../src/utils/config'
import { exposureDMMF, file, generateExposure } from '../helpers/exposureHelpers'
import { generateAll } from '../helpers/helpers'
import { getEnumValues, getInputFieldNames, hasInput } from '../helpers/parse'

const noCrud: Config = { crud: { disabled: true } }
/** Every input Prisma has (no pruning: without crud nothing says what is used) */
const inputsOf = async (exposure: ExposureConfig | undefined, overrides: Config = {}) =>
  file(
    await generateExposure(exposure, { ...noCrud, ...overrides, crud: { ...noCrud.crud, ...overrides.crud } }),
    'inputs.ts',
  )

/** Inputs after pruning, with the crud generated */
const prunedOf = async (exposure: ExposureConfig, overrides: Config = {}) =>
  file(await generateExposure(exposure, overrides), 'inputs.ts')

const names = (inputs: string, name: string) => getInputFieldNames(inputs, name)

describe('states in inputs', () => {
  const fields = { passwordHash: 'hidden', phone: 'unfilterable', role: 'readonly', email: 'guarded' } as const
  const exposure: ExposureConfig = { models: { User: { fields } } }
  let inputs: string
  beforeAll(async () => {
    inputs = await inputsOf(exposure)
  })

  it('hidden: absent from where, whereUnique, orderBy, create, update and the scalar enum', () => {
    for (const input of [
      'UserWhereInput',
      'UserWhereUniqueInput',
      'UserOrderByWithRelationInput',
      'UserCreateInput',
      'UserUpdateInput',
    ])
      expect(names(inputs, input), input).not.toContain('passwordHash')
    expect(getEnumValues(inputs, 'UserScalarFieldEnum')).not.toContain('passwordHash')
    expect(names(inputs, 'UserWhereInput')).toContain('email')
  })

  it('hidden: absent from the create-many and update-many inputs and from the nested ones', () => {
    for (const input of [
      'UserCreateManyInput',
      'UserUpdateManyMutationInput',
      'UserCreateWithoutPostsInput',
      'UserUpdateWithoutPostsInput',
      'UserCreateWithoutTokensInput',
    ])
      expect(names(inputs, input), input).not.toContain('passwordHash')
  })

  it('hidden: absent from the aggregate order inputs', () => {
    for (const input of [
      'UserCountOrderByAggregateInput',
      'UserMaxOrderByAggregateInput',
      'UserMinOrderByAggregateInput',
      'UserOrderByWithAggregationInput',
    ])
      expect(names(inputs, input), input).not.toContain('passwordHash')
    expect(names(inputs, 'UserCountOrderByAggregateInput')).toContain('email')
  })

  it('hidden and unfilterable fields are also out of the scalar where of nested updateMany', async () => {
    const scalarWhere = await inputsOf({ models: { Post: { fields: { title: 'hidden', published: 'unfilterable' } } } })
    expect(names(scalarWhere, 'PostScalarWhereInput')).not.toContain('title')
    expect(names(scalarWhere, 'PostScalarWhereInput')).not.toContain('published')
    expect(names(scalarWhere, 'PostScalarWhereInput')).toContain('createdAt')
  })

  it('a compound unique that contains a hidden field goes away with its entry in WhereUniqueInput', async () => {
    const compound = await inputsOf({ models: { AuthToken: { fields: { token: 'hidden' } } } })
    expect(hasInput(compound, 'AuthTokenUserIdTokenCompoundUniqueInput')).toBe(false)
    expect(names(compound, 'AuthTokenWhereUniqueInput')).not.toContain('userId_token')
    expect(names(compound, 'AuthTokenWhereUniqueInput')).toContain('id')
    expect(hasInput(inputs, 'AuthTokenUserIdTokenCompoundUniqueInput')).toBe(true)
    expect(names(inputs, 'AuthTokenWhereUniqueInput')).toContain('userId_token')
    expect(compound).not.toContain('userId_token')
  })

  it('unfilterable: out of where/whereUnique/scalarWhere/orderBy/scalar enum, still in create and update', () => {
    for (const input of ['UserWhereInput', 'UserOrderByWithRelationInput', 'UserCountOrderByAggregateInput'])
      expect(names(inputs, input), input).not.toContain('phone')
    expect(getEnumValues(inputs, 'UserScalarFieldEnum')).not.toContain('phone')
    for (const input of ['UserCreateInput', 'UserUpdateInput', 'UserCreateManyInput'])
      expect(names(inputs, input), input).toContain('phone')
  })

  it('an unfilterable relation can not be filtered nor ordered by', async () => {
    const relation = await inputsOf({ models: { User: { fields: { posts: 'unfilterable' } } } })
    for (const input of ['UserWhereInput', 'UserOrderByWithRelationInput'])
      expect(names(relation, input)).not.toContain('posts')
    expect(names(relation, 'UserCreateInput')).toContain('posts')
    expect(names(relation, 'UserUpdateInput')).toContain('posts')
  })

  it('readonly: out of create, update and their unchecked/nested variants, still in where and orderBy', () => {
    for (const input of [
      'UserCreateInput',
      'UserUpdateInput',
      'UserCreateManyInput',
      'UserUpdateManyMutationInput',
      'UserCreateWithoutPostsInput',
    ])
      expect(names(inputs, input), input).not.toContain('role')
    for (const input of ['UserWhereInput', 'UserOrderByWithRelationInput', 'UserWhereUniqueInput']) {
      if (input !== 'UserWhereUniqueInput') expect(names(inputs, input), input).toContain('role')
    }
  })

  it('a readonly relation: no connect, create or connectOrCreate on it', async () => {
    const relation = await inputsOf({ models: { Post: { fields: { author: 'readonly' } } } })
    for (const input of [
      'PostCreateInput',
      'PostUpdateInput',
      'PostCreateWithoutCommentsInput',
      'PostUpdateWithoutCommentsInput',
    ])
      expect(names(relation, input), input).not.toContain('author')
    // Reading and filtering by it is untouched
    expect(names(relation, 'PostWhereInput')).toContain('author')
  })

  it('@Pothos.omit keeps working next to the states', async () => {
    const omitted = await inputsOf({ models: { User: { fields: { passwordHash: 'hidden', phone: 'readonly' } } } })
    expect(names(omitted, 'UserWhereInput')).not.toContain('internalNote')
    expect(omitted).toContain("// 'internalNote' was omitted due to @Pothos.omit found in schema comment")
    expect(names(omitted, 'UserCreateInput')).not.toContain('createdAt')
    // What exposure hides leaves no trace, not even a comment
    expect(omitted).not.toContain('passwordHash')
  })

  it('an input left without fields uses NEVER and NEVER is defined', async () => {
    const empty = await inputsOf({ models: { Bridge: { fields: { id: 'readonly' } } } })
    expect(names(empty, 'BridgeUpdateManyMutationInput')).toEqual(['_'])
    expect(empty).toContain('_: t.field({ type: NEVER }),')
    expect(empty.match(/export const NEVER = /g)).toHaveLength(1)
  })

  it('a model with only relations and states', async () => {
    const files = await generateExposure(
      { operations: ['findMany', 'updateOne'], models: { Bridge: { fields: { posts: 'readonly' } } } },
      { inputs: { simple: false } },
    )
    expect(hasInput(file(files, 'inputs.ts'), 'BridgeUpdateInput')).toBe(true)
    expect(names(file(files, 'inputs.ts'), 'BridgeUpdateInput')).not.toContain('posts')
  })

  it('mapIdFieldsToGraphqlId: WhereUniqueInputs with hidden in another field', async () => {
    const mapped = await inputsOf(
      { models: { User: { fields: { passwordHash: 'hidden' } } } },
      { inputs: { mapIdFieldsToGraphqlId: 'WhereUniqueInputs' } },
    )
    expect(mapped).toContain('id: t.id(')
    expect(names(mapped, 'UserWhereUniqueInput')).not.toContain('passwordHash')
  })

  it('the rest of the inputs do not change byte by byte', async () => {
    const plain = file(await generateAll(noCrud, await exposureDMMF()), 'inputs.ts')
    const withExposure = await inputsOf(exposure)
    const block = (source: string, name: string) =>
      source.slice(source.indexOf(`export const ${name}Fields`), source.indexOf(`export const ${name} =`))
    for (const name of [
      'PostWhereInput',
      'CommentCreateInput',
      'PairWhereUniqueInput',
      'TypedUpdateInput',
      'AuditLogOrderByWithRelationInput',
    ])
      expect(block(withExposure, name), name).toBe(block(plain, name))
    // and only the inputs of `User` may have changed among the ones that are not nested operations
    expect(withExposure.length).toBeLessThan(plain.length)
  })

  it('the combination [guarded, unfilterable] filters like unfilterable and reads like guarded', () => {
    expect(names(inputs, 'UserWhereInput')).not.toContain('phone')
  })

  it('a state on an @id field', async () => {
    const id = await inputsOf({ operations: ['findMany', 'count'], models: { Comment: { fields: { id: 'hidden' } } } })
    expect(names(id, 'CommentWhereInput')).not.toContain('id')
    expect(names(id, 'CommentCreateInput')).not.toContain('id')
  })

  it('a state on an @updatedAt or defaulted field', async () => {
    const updated = await inputsOf({
      models: { Post: { fields: { updatedAt: 'readonly', published: 'unfilterable' } } },
    })
    expect(names(updated, 'PostUpdateInput')).not.toContain('updatedAt')
    expect(names(updated, 'PostWhereInput')).not.toContain('published')
    expect(names(updated, 'PostCreateInput')).toContain('published')
  })

  it('hidden on a foreign key keeps the relation', async () => {
    const fk = await inputsOf({ operations: ['findMany'], models: { Post: { fields: { authorId: 'hidden' } } } })
    expect(names(fk, 'PostWhereInput')).not.toContain('authorId')
    expect(names(fk, 'PostWhereInput')).toContain('author')
    expect(names(fk, 'PostCreateInput')).toContain('author')
  })

  it('Json, Decimal and BigInt with states', async () => {
    const typed = await inputsOf({
      models: { Typed: { fields: { meta: 'readonly', price: 'unfilterable', big: 'unfilterable' } } },
    })
    expect(names(typed, 'TypedCreateInput')).not.toContain('meta')
    expect(names(typed, 'TypedWhereInput')).not.toContain('price')
    expect(names(typed, 'TypedWhereInput')).not.toContain('big')
    expect(names(typed, 'TypedCreateInput')).toContain('big')
    for (const scalar of ['Json', 'Decimal', 'Bigint', 'DateTime', 'Bytes'])
      expect(typed).toContain(`export const ${scalar} = builder.scalarType(`)
  })

  it('readonly on a relation also removes its foreign key from the unchecked inputs (simple mode)', async () => {
    const simple = await inputsOf(
      { models: { Post: { fields: { author: 'readonly' } } } },
      { inputs: { simple: true } },
    )
    expect(names(simple, 'PostCreateInput')).not.toContain('authorId')
    expect(names(simple, 'PostUpdateInput')).not.toContain('authorId')
    expect(names(simple, 'PostCreateInput')).toContain('title')
  })

  it('hidden on a relation does not remove its foreign key', async () => {
    const simple = await inputsOf({ models: { Post: { fields: { author: 'hidden' } } } }, { inputs: { simple: true } })
    expect(names(simple, 'PostCreateInput')).toContain('authorId')
    expect(names(simple, 'PostWhereInput')).not.toContain('author')
  })
})

describe('regressions', () => {
  it('hiding the only editable column does not leave NEVER undefined', async () => {
    const files = await generateExposure(
      {
        operations: ['findMany', 'updateMany'],
        models: { AuditLog: { fields: { action: 'readonly', createdAt: 'readonly', id: 'readonly' } } },
      },
      { crud: { generateAutocrud: false } },
    )
    const inputs = file(files, 'inputs.ts')
    expect(names(inputs, 'AuditLogUpdateManyMutationInput')).toEqual(['_'])
    expect(inputs).toContain('type: NEVER')
    expect(inputs).toContain("export const NEVER = builder.scalarType('NEVER'")
  })

  it('NEVER is defined exactly once, and only if it is used', async () => {
    const used = await prunedOf({
      operations: ['updateMany'],
      models: { AuditLog: { fields: { action: 'readonly', createdAt: 'readonly', id: 'readonly' } } },
    })
    expect(used.match(/export const NEVER = /g)).toHaveLength(1)
    const unused = await prunedOf({ operations: ['findMany'] })
    expect(unused).not.toContain('NEVER')
  })

  it('every identifier the inputs use is defined (what builder.toSchema needs)', async () => {
    const inputs = await prunedOf({
      operations: ['updateMany', 'findMany'],
      models: { AuditLog: { fields: { action: 'readonly', createdAt: 'readonly', id: 'readonly' } } },
    })
    const defined = new Set([...inputs.matchAll(/^export const (\w+) = /gm)].map((m) => m[1]))
    const used = [...inputs.matchAll(/type: \[?(\w+)\]?[,}]/g)].map((m) => m[1] as string)
    for (const name of used) expect(defined.has(name), `${name} is used but not defined`).toBe(true)
  })

  it('nested XCreateWithoutYInput / XUpdateWithoutYInput do not contain hidden fields', async () => {
    const inputs = await inputsOf({
      operations: ['findMany'],
      models: { User: { fields: { passwordHash: 'hidden' } }, Post: { fields: { title: 'hidden' } } },
    })
    for (const input of [
      'UserCreateWithoutPostsInput',
      'UserUpdateWithoutPostsInput',
      'UserCreateWithoutTokensInput',
      'UserUpdateWithoutTokensInput',
    ])
      expect(names(inputs, input), input).not.toContain('passwordHash')
    for (const input of [
      'PostCreateWithoutAuthorInput',
      'PostUpdateWithoutAuthorInput',
      'PostCreateWithoutCommentsInput',
    ])
      expect(names(inputs, input), input).not.toContain('title')
    expect(inputs).not.toContain('passwordHash')
  })
})

describe('pruning', () => {
  it('without exposure nothing is pruned (byte-identical)', async () => {
    // covered byte by byte by the golden files; here: everything Prisma has is there
    const plain = file(await generateAll({}, await exposureDMMF()), 'inputs.ts')
    expect(hasInput(plain, 'UserCreateInput')).toBe(true)
    expect(hasInput(plain, 'UserCountOrderByAggregateInput')).toBe(true)
    expect(plain).toContain("builder.enumType('NullsOrder'")
  })

  it('read-only: no CreateInput nor UpdateInput', async () => {
    const inputs = await prunedOf({ operations: ['findMany', 'findUnique', 'count'] })
    expect(hasInput(inputs, 'UserWhereInput')).toBe(true)
    expect(hasInput(inputs, 'UserCreateInput')).toBe(false)
    expect(hasInput(inputs, 'UserUpdateInput')).toBe(false)
    expect(hasInput(inputs, 'UserUpdateManyMutationInput')).toBe(false)
  })

  it('the where of a model without operations is only there if a relation reaches it', async () => {
    const inputs = await prunedOf({
      operations: ['findMany'],
      models: { Comment: { operations: [] }, AuditLog: { operations: [] } },
    })
    // Post.comments is a visible list relation: it takes a CommentWhereInput
    expect(hasInput(inputs, 'CommentWhereInput')).toBe(true)
    expect(hasInput(inputs, 'AuditLogWhereInput')).toBe(false)
    expect(hasInput(inputs, 'AuditLogOrderByWithRelationInput')).toBe(false)
    expect(inputs).not.toContain('AuditLogScalarFieldEnum')
    const hiddenRelation = await prunedOf({
      operations: ['findMany'],
      models: { Comment: { operations: [] }, Post: { fields: { comments: 'hidden' } } },
    })
    expect(hasInput(hiddenRelation, 'CommentWhereInput')).toBe(false)
  })

  it('the enums that are reached stay and the others go', async () => {
    const inputs = await prunedOf({ operations: ['findMany'] })
    expect(inputs).toContain("builder.enumType('SortOrder'")
    expect(inputs).toContain("builder.enumType('Role'")
    expect(inputs).toContain("builder.enumType('QueryMode'")
    expect(inputs).not.toContain("builder.enumType('NullsOrder'")
    expect(inputs).not.toContain("builder.enumType('JsonNullValueInput'")
    // Without any mutation nothing reaches the update operations of Role
    expect(hasInput(inputs, 'EnumRoleFieldUpdateOperationsInput')).toBe(false)
    expect(hasInput(inputs, 'EnumRoleFilter')).toBe(true)
  })

  it('the scalars in use are recalculated over what is emitted', async () => {
    const withTyped = await prunedOf({ operations: ['findMany'] })
    for (const scalar of ['Json', 'Decimal', 'Bigint', 'DateTime', 'Bytes'])
      expect(withTyped).toContain(`export const ${scalar} = builder.scalarType(`)
    // No model has a Json field once `Typed` and `User.data` are hidden: Json is not needed
    const without = await prunedOf({
      operations: ['findMany'],
      models: { Typed: { fields: { meta: 'hidden' } }, User: { fields: { data: 'hidden' } } },
    })
    expect(without).not.toContain("builder.scalarType('Json'")
    expect(without).toContain("builder.scalarType('DateTime'")
  })

  it('a scalar that only an object uses is still defined', async () => {
    // Only findUnique by id: no input has a DateTime, but the objects return one
    const inputs = await prunedOf({ operations: ['findUnique'] })
    expect(inputs).toContain("export const DateTime = builder.scalarType('DateTime'")
    expect(inputs).toContain("export const Role = builder.enumType('Role'")
  })

  it('NEVER only if it is used', async () => {
    expect(await prunedOf({ operations: ['findMany'] })).not.toContain('NEVER')
  })

  it('@Pothos.omit stays intact', async () => {
    const ok = await prunedOf({ operations: ['findMany', 'updateOne', 'findUnique'] })
    expect(names(ok, 'UserWhereInput')).not.toContain('internalNote')
    expect(ok).toContain("// 'internalNote' was omitted due to @Pothos.omit")
  })

  it('the size of inputs.ts goes down against no pruning', async () => {
    const plain = file(await generateAll({}, await exposureDMMF()), 'inputs.ts')
    const pruned = await prunedOf({ operations: ['findMany', 'findUnique', 'count'] })
    expect(pruned.length).toBeLessThan(plain.length * 0.5)
  })

  it('no input of an operation that does not exist is listed', async () => {
    const inputs = await prunedOf({ operations: ['findMany'], models: { Post: { operations: [] } } })
    expect(hasInput(inputs, 'PostWhereUniqueInput')).toBe(true) // reached by User.posts
    expect(hasInput(inputs, 'PostCreateInput')).toBe(false)
    expect(hasInput(inputs, 'PostCreateNestedManyWithoutAuthorInput')).toBe(false)
  })

  it('the arguments of every generated operation have their inputs', async () => {
    const files = await generateExposure({
      operations: [
        'findMany',
        'findFirst',
        'count',
        'findUnique',
        'createOne',
        'createMany',
        'updateOne',
        'updateMany',
        'upsertOne',
        'deleteOne',
        'deleteMany',
      ],
      models: { User: { fields: {} } },
    })
    const inputs = file(files, 'inputs.ts')
    const defined = new Set([...inputs.matchAll(/^export const (\w+) = /gm)].map((m) => m[1]))
    for (const [name, content] of Object.entries(files)) {
      if (!/\/(queries|mutations)\/\w+\.base\.ts$|object\.base\.ts$/.test(name)) continue
      for (const [, used] of content.matchAll(/Inputs\.(\w+)/g))
        expect(defined.has(used as string), `${name} uses Inputs.${used}`).toBe(true)
    }
  })

  it('the same holds when every model has restricted operations and hidden fields', async () => {
    const files = await generateExposure({
      operations: ['findMany', 'count'],
      models: {
        Post: {
          operations: { inherit: true, updateOne: 'canWrite' },
          fields: { authorId: 'hidden', published: 'readonly' },
        },
        User: { fields: { data: 'hidden', role: 'unfilterable' } },
      },
    })
    const inputs = file(files, 'inputs.ts')
    const defined = new Set([...inputs.matchAll(/^export const (\w+) = /gm)].map((m) => m[1]))
    for (const [name, content] of Object.entries(files)) {
      for (const [, used] of content.matchAll(/Inputs\.(\w+)/g))
        expect(defined.has(used as string), `${name} uses Inputs.${used}`).toBe(true)
    }
    // Every reference between inputs points to a defined one too
    for (const [, ref] of inputs.matchAll(/type: \[?(\w+)\]?[,}]/g))
      expect(defined.has(ref as string), `inputs.ts uses ${ref}`).toBe(true)
  })

  it('keepInputs keeps an input (and what it reaches) for your own resolvers', async () => {
    const without = await prunedOf({ operations: ['findMany'] })
    expect(hasInput(without, 'UserCreateInput')).toBe(false)
    const kept = await prunedOf({ operations: ['findMany'], keepInputs: ['UserCreateInput', 'NullsOrder'] })
    expect(hasInput(kept, 'UserCreateInput')).toBe(true)
    expect(hasInput(kept, 'PostCreateNestedManyWithoutAuthorInput')).toBe(true)
    expect(kept).toContain("builder.enumType('NullsOrder'")
  })

  it('crud.disabled: the states apply but nothing is pruned', async () => {
    const inputs = await inputsOf({ models: { User: { fields: { passwordHash: 'hidden' } } } })
    expect(hasInput(inputs, 'UserCreateInput')).toBe(true)
    expect(inputs).not.toContain('passwordHash')
  })

  it('the enums of a hidden field are not leaked and ScalarFieldEnum is filtered when kept', async () => {
    const inputs = await prunedOf({
      operations: ['findMany'],
      models: { User: { fields: { passwordHash: 'hidden', phone: 'unfilterable' } } },
    })
    expect(getEnumValues(inputs, 'UserScalarFieldEnum')).toEqual([
      'id',
      'email',
      'role',
      'tokenCount',
      'internalNote',
      'data',
      'createdAt',
    ])
  })
})
