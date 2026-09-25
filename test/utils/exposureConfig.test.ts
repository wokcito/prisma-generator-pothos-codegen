import fs from 'node:fs/promises'
import type { DMMF } from '@prisma/generator-helper'
import type { Config, ExposureConfig } from '../../src/utils/config'
import { didYouMean, normalizeExposure } from '../../src/utils/exposureConfig'
import { validateExposure } from '../../src/utils/exposureValidation'
import { exposureDMMF, withAllModels } from '../helpers/exposureHelpers'
import { generateAll, mergeConfig } from '../helpers/helpers'

let dmmf: DMMF.Document
beforeAll(async () => {
  dmmf = await exposureDMMF()
})

/** Every model listed, so the global operations reach all of them (see `withAllModels`) */
const normalize = (exposure: unknown, allModels = true) =>
  normalizeExposure(allModels && exposure ? withAllModels(exposure as ExposureConfig, dmmf) : exposure, dmmf)
const ops = (exposure: ExposureConfig, model: string) => normalize(exposure)?.models[model]?.operations

/** Message of the error (or `undefined` when valid) */
const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const validate = (exposure: unknown, crud: NonNullable<Config['crud']> = {}, allModels = true) => {
  const config = allModels && isObject(exposure) ? withAllModels(exposure as ExposureConfig, dmmf) : exposure
  try {
    validateExposure(mergeConfig({ crud: { ...crud, exposure: config as ExposureConfig } }), dmmf)
  } catch (error) {
    return (error as Error).message
  }
  return undefined
}

describe('normalizeExposure: operations', () => {
  it('a list of operations has no tags', () => {
    expect(ops({ operations: ['findMany', 'findUnique'] }, 'Post')).toEqual({ findMany: [], findUnique: [] })
  })

  it('a string is one tag', () => {
    expect(ops({ operations: { findMany: 'loggedIn' } }, 'Post')).toEqual({ findMany: ['loggedIn'] })
  })

  it('an array is several tags, in order', () => {
    expect(ops({ operations: { findMany: ['loggedIn', 'canRead', 'audit'] } }, 'Post')).toEqual({
      findMany: ['loggedIn', 'canRead', 'audit'],
    })
  })

  it('[] and true enable the operation without tags', () => {
    expect(ops({ operations: { count: [], findMany: true } }, 'Post')).toEqual({ findMany: [], count: [] })
  })

  it('false and omitted operations do not exist', () => {
    expect(ops({ operations: { findMany: [], count: false } }, 'Post')).toEqual({ findMany: [] })
  })

  it('operations come out in a fixed order whatever the order of the config', () => {
    const result = ops({ operations: { deleteMany: [], count: [], findMany: [] } }, 'Post')
    expect(Object.keys(result ?? {})).toEqual(['findMany', 'count', 'deleteMany'])
  })

  it('a model without operations uses the global ones', () => {
    expect(ops({ operations: { findMany: 'a' }, models: { User: { fields: { phone: 'guarded' } } } }, 'User')).toEqual({
      findMany: ['a'],
    })
  })

  it('{ count: [] } in a model replaces the whole global', () => {
    expect(
      ops({ operations: { findMany: 'a', findUnique: 'a' }, models: { Post: { operations: { count: [] } } } }, 'Post'),
    ).toEqual({ count: [] })
  })

  it('operations: [] in a model means none', () => {
    expect(ops({ operations: { findMany: 'a' }, models: { Post: { operations: [] } } }, 'Post')).toEqual({})
    expect(ops({ operations: { findMany: 'a' }, models: { Post: { operations: {} } } }, 'Post')).toEqual({})
  })

  it('inherit: true keeps the global and changes one operation', () => {
    expect(
      ops(
        {
          operations: { findMany: ['a', 'b'], findUnique: 'a' },
          models: { Post: { operations: { inherit: true, findMany: 'canRead' } } },
        },
        'Post',
      ),
    ).toEqual({ findMany: ['canRead'], findUnique: ['a'] })
  })

  it('inherit: true with false removes an operation', () => {
    expect(
      ops(
        { operations: { findMany: [], count: [] }, models: { Post: { operations: { inherit: true, count: false } } } },
        'Post',
      ),
    ).toEqual({ findMany: [] })
  })

  it('inherit without a global operations is an error', () => {
    expect(() => normalize({ models: { Post: { operations: { inherit: true, findMany: [] } } } })).toThrow(
      '"inherit" needs crud.exposure.operations to inherit from',
    )
  })

  it('without operations anywhere every model has every operation (as in 1.0.0)', () => {
    expect(Object.keys(ops({}, 'Post') ?? {})).toHaveLength(11)
    expect(normalize({})?.usesOperations).toBe(false)
  })

  it('a model with operations while the others have none: only that model is restricted', () => {
    const exposure = normalize({ models: { Post: { operations: ['findMany'] } } })
    expect(Object.keys(exposure?.models.Post?.operations ?? {})).toEqual(['findMany'])
    expect(Object.keys(exposure?.models.User?.operations ?? {})).toHaveLength(11)
    expect(exposure?.usesOperations).toBe(true)
  })

  it('repeated tags are used once and produce a warning', () => {
    const exposure = normalize({ operations: { findMany: ['a', 'b', 'a'] } })
    expect(exposure?.models.Post?.operations.findMany).toEqual(['a', 'b'])
    expect(exposure?.warnings.join('\n')).toMatch(/operations\.findMany: repeated tag in \[a, b, a\]/)
  })
})

describe('normalizeExposure: maxTake and fields', () => {
  it('a global maxTake applies to every model', () => {
    const exposure = normalize({ maxTake: 50 })
    expect(Object.values(exposure?.models ?? {}).every((m) => m.maxTake === 50)).toBe(true)
  })

  it('the maxTake of a model takes priority', () => {
    const exposure = normalize({ maxTake: 50, models: { Post: { maxTake: 10 } } })
    expect(exposure?.models.Post?.maxTake).toBe(10)
    expect(exposure?.models.User?.maxTake).toBe(50)
  })

  it('no maxTake anywhere is no limit', () => {
    expect(normalize({})?.models.Post?.maxTake).toBeUndefined()
  })

  it('a state as a string and as an array', () => {
    const exposure = normalize({
      models: { User: { fields: { email: 'guarded', phone: ['guarded', 'unfilterable'] } } },
    })
    expect(exposure?.models.User?.fields.email?.states).toEqual(['guarded'])
    expect(exposure?.models.User?.fields.phone?.states).toEqual(['unfilterable', 'guarded'])
  })

  it('hidden implies unfilterable and readonly', () => {
    const field = normalize({ models: { User: { fields: { passwordHash: 'hidden' } } } })?.models.User?.fields
      .passwordHash
    expect(field).toMatchObject({ hidden: true, unfilterable: true, readonly: true, guarded: false })
    expect(field?.states).toEqual(['hidden'])
  })

  it('repeated states are deduplicated', () => {
    const field = normalize({ models: { User: { fields: { phone: ['readonly', 'readonly', 'guarded'] } } } })?.models
      .User?.fields.phone
    expect(field?.states).toEqual(['readonly', 'guarded'])
  })

  it('a readonly relation also makes its foreign keys readonly, a hidden one does not', () => {
    const readonly = normalize({ models: { Post: { fields: { author: 'readonly' } } } })?.models.Post
    expect(readonly?.fields.authorId).toMatchObject({ readonly: true, states: [], hidden: false })
    const hidden = normalize({ models: { Post: { fields: { author: 'hidden' } } } })?.models.Post
    expect(hidden?.fields.authorId).toMatchObject({ readonly: false, hidden: false })
  })

  it('an unfilterable relation does not make its foreign key unfilterable', () => {
    const post = normalize({ models: { Post: { fields: { author: 'unfilterable' } } } })?.models.Post
    expect(post?.fields.author?.unfilterable).toBe(true)
    expect(post?.fields.authorId?.unfilterable).toBe(false)
  })

  it('without exposure it returns undefined', () => {
    expect(normalize(undefined)).toBeUndefined()
  })

  it('exposure: {} is everything by default, without restrictions', () => {
    const exposure = normalize({})
    expect(exposure?.usesOperations).toBe(false)
    expect(exposure?.manifestPath).toBeUndefined()
    for (const model of Object.values(exposure?.models ?? {})) {
      expect(model.usesDefaults).toBe(true)
      expect(Object.values(model.fields).every((f) => !f.hidden && !f.guarded && !f.readonly && !f.unfilterable)).toBe(
        true,
      )
    }
  })

  it('it does not mutate the input', () => {
    const exposure = {
      operations: { findMany: ['a', 'a'], count: true },
      models: { Post: { operations: { inherit: true, count: false }, fields: { author: ['readonly', 'readonly'] } } },
    }
    const snapshot = JSON.parse(JSON.stringify(exposure))
    normalize(exposure)
    expect(exposure).toEqual(snapshot)
  })

  it('excludeResolvers* with exposure.operations is an error (also includeResolvers*)', () => {
    for (const option of [
      'excludeResolversContain',
      'excludeResolversExact',
      'includeResolversContain',
      'includeResolversExact',
    ] as const)
      expect(validate({ operations: ['findMany'] }, { [option]: ['x'] })).toContain(
        'use either crud.exposure.operations or excludeResolvers*/includeResolvers*, not both',
      )
    // an operations override in a model counts too
    expect(validate({ models: { Post: { operations: [] } } }, { excludeResolversContain: ['x'] })).toContain('not both')
  })

  it('without exposure.operations excludeResolvers* still work', () => {
    expect(validate({ maxTake: 5 }, { excludeResolversContain: ['User'] })).toBeUndefined()
  })
})

describe('validateExposure', () => {
  it('an unknown model lists the valid ones', () => {
    const message = validate({ models: { Usr: {} } })
    expect(message).toContain('crud.exposure.models.Usr: model "Usr" does not exist. Available models: User, Post,')
    expect(message).toContain('(did you mean "User"?)')
  })

  it('an unknown field lists the valid ones', () => {
    const message = validate({ models: { User: { fields: { emial: 'hidden' } } } })
    expect(message).toContain(
      'crud.exposure.models.User.fields.emial: field "emial" does not exist on model "User". Available fields: id, email,',
    )
    expect(message).toContain('(did you mean "email"?)')
  })

  it('an unknown operation in the global operations', () => {
    expect(validate({ operations: { findAll: [] } })).toContain(
      'crud.exposure.operations: operation "findAll" does not exist. Available operations: findMany, findUnique',
    )
    expect(validate({ operations: ['findAll'] })).toContain('operation "findAll" does not exist')
  })

  it('an unknown operation in a model', () => {
    expect(validate({ models: { Post: { operations: { fetch: [] } } } })).toContain(
      'crud.exposure.models.Post.operations: operation "fetch" does not exist',
    )
  })

  it.each([5, {}, null, [1]])('a tag that is not a string (%j)', (tag) => {
    const message = validate({ operations: { findMany: tag } })
    expect(message).toMatch(/crud\.exposure\.operations\.findMany: tag must be a string, got (number|object|null)/)
  })

  it('an unknown state', () => {
    expect(validate({ models: { User: { fields: { email: 'secret' } } } })).toContain(
      'crud.exposure.models.User.fields.email: unknown state "secret". Valid states: unfilterable, readonly, guarded, hidden',
    )
  })

  it('hidden combined with another state', () => {
    expect(validate({ models: { User: { fields: { phone: ['hidden', 'readonly'] } } } })).toContain(
      '"hidden" cannot be combined with other states',
    )
    expect(validate({ models: { User: { fields: { phone: ['hidden', 'hidden'] } } } })).toBeUndefined()
  })

  it('guarded on a list relation', () => {
    expect(validate({ models: { User: { fields: { posts: 'guarded' } } } })).toContain(
      '"posts" is a list relation: it cannot be guarded, list relations are restricted with scope',
    )
  })

  it('guarded on a scalar and on a to-one relation is accepted', () => {
    expect(
      validate({ models: { User: { fields: { email: 'guarded' } }, Post: { fields: { author: 'guarded' } } } }),
    ).toBeUndefined()
  })

  it.each([0, -5, 1.5, '10'])('an invalid global maxTake (%j)', (maxTake) => {
    expect(validate({ maxTake })).toContain(
      `crud.exposure.maxTake: maxTake must be a positive integer, got ${JSON.stringify(maxTake)}`,
    )
  })

  it('an invalid maxTake in a model', () => {
    expect(validate({ models: { Post: { maxTake: 0 } } })).toContain(
      'crud.exposure.models.Post.maxTake: maxTake must be a positive integer, got 0',
    )
  })

  it('every scalar of a model hidden', () => {
    const message = validate({
      models: { Comment: { fields: { id: 'hidden', body: 'hidden', postId: 'hidden' } } },
    })
    expect(message).toContain(
      'every scalar field of model "Comment" is hidden [id, body, postId], which would leave CommentScalarFieldEnum',
    )
    expect(message).toContain('Keep at least one field visible')
  })

  it('every unique identifier hidden with findUnique/updateOne/deleteOne enabled', () => {
    const message = validate({ models: { AppClientAuth: { fields: { id: 'hidden', clientId: 'hidden' } } } })
    expect(message).toContain('model "AppClientAuth" has no unique identifier left after hiding [id, clientId]')
    expect(message).toContain(
      'findUnique, deleteOne, updateOne, upsertOne are still enabled. Disable them or hide other fields',
    )
  })

  it('the same with those operations disabled is fine', () => {
    expect(
      validate({
        models: {
          AppClientAuth: { fields: { id: 'hidden', clientId: 'hidden' }, operations: ['findMany', 'count'] },
        },
      }),
    ).toBeUndefined()
    expect(
      validate(
        { models: { AppClientAuth: { fields: { id: 'hidden', clientId: 'hidden' } } } },
        { excludeResolversContain: ['AppClientAuth'] },
      ),
    ).toBeUndefined()
  })

  it('a unique identifier that is only unfilterable also leaves WhereUniqueInput unusable', () => {
    expect(
      validate({ models: { AppClientAuth: { fields: { id: 'unfilterable', clientId: 'unfilterable' } } } }),
    ).toContain('has no unique identifier left')
  })

  it('a compound unique that contains a hidden field is dropped, it does not fail', () => {
    expect(
      validate({
        models: {
          AuthToken: { fields: { token: 'hidden' }, operations: ['findMany', 'findUnique', 'updateOne', 'deleteOne'] },
        },
      }),
    ).toBeUndefined()
  })

  it('a required column that is readonly with createOne enabled', () => {
    const message = validate({ models: { AppClientAuth: { fields: { secret: 'readonly' } } } })
    expect(message).toContain(
      '"AppClientAuth.secret" is required in Prisma and readonly, so createOne cannot work. Remove createOne and createMany from operations',
    )
  })

  it('a required foreign key made readonly by its relation is reported too', () => {
    expect(validate({ models: { Post: { fields: { author: 'readonly' } } } })).toContain(
      '"Post.authorId" is required in Prisma and readonly',
    )
  })

  it('a hidden required column with createOne enabled is reported too', () => {
    expect(validate({ models: { User: { fields: { passwordHash: 'hidden' } } } })).toContain(
      '"User.passwordHash" is required in Prisma and hidden, so createOne cannot work',
    )
  })

  it('the same with createOne not enabled is fine', () => {
    expect(
      validate({
        operations: ['findMany', 'findUnique', 'updateOne'],
        models: { AppClientAuth: { fields: { secret: 'readonly' } } },
      }),
    ).toBeUndefined()
  })

  it('an optional or defaulted readonly column is fine', () => {
    expect(
      validate({ models: { User: { fields: { phone: 'readonly', role: 'readonly', createdAt: 'readonly' } } } }),
    ).toBeUndefined()
  })

  it('upsertOne with tags is valid at generation time', () => {
    expect(validate({ operations: { upsertOne: ['canWrite'], findMany: [] } })).toBeUndefined()
  })

  it('an unknown key at the root, with a suggestion', () => {
    const message = validate({ maxTakee: 5 })
    expect(message).toContain(
      'crud.exposure: unknown key "maxTakee". Valid keys: operations, maxTake, manifest, keepInputs, models (did you mean "maxTake"?)',
    )
  })

  it('an unknown key in a model', () => {
    expect(validate({ models: { User: { field: {} } } })).toContain(
      'crud.exposure.models.User: unknown key "field". Valid keys: fields, operations, maxTake (did you mean "fields"?)',
    )
  })

  it('several problems of different kinds are reported together, with their path', () => {
    const message = validate({
      maxTake: 0,
      operations: { fetch: [] },
      models: { Usr: {}, User: { fields: { emial: 'hidden', phone: 'secret', posts: 'guarded' } } },
    }) as string
    expect(message.startsWith('Invalid pothos-codegen configuration:\n - ')).toBe(true)
    for (const path of [
      'crud.exposure.maxTake',
      'crud.exposure.operations',
      'crud.exposure.models.Usr',
      'crud.exposure.models.User.fields.emial',
      'crud.exposure.models.User.fields.phone',
      'crud.exposure.models.User.fields.posts',
    ])
      expect(message).toContain(path)
    expect(message.split('\n - ')).toHaveLength(7)
  })

  it('it runs with crud.disabled: true', () => {
    expect(validate({ models: { Usr: {} } }, { disabled: true })).toContain('model "Usr" does not exist')
    // what needs the crud is not checked when there is none
    expect(
      validate({ models: { AppClientAuth: { fields: { id: 'hidden', clientId: 'hidden' } } } }, { disabled: true }),
    ).toBeUndefined()
  })

  it('the message has the path down to the key', () => {
    expect(validate({ models: { User: { fields: { emial: 'hidden' } } } })).toContain(
      'crud.exposure.models.User.fields.emial',
    )
  })

  it('suggestions use edit distance <= 2', () => {
    expect(didYouMean('emial', ['id', 'email'])).toBe(' (did you mean "email"?)')
    expect(didYouMean('zzzzzz', ['id', 'email'])).toBe('')
    expect(didYouMean('EMAIL', ['id', 'email'])).toBe(' (did you mean "email"?)')
  })

  it.each([5, 'x', null, [], true])('exposure that is not an object (%j)', (exposure) => {
    expect(validate(exposure)).toMatch(/crud\.exposure: must be an object, got (number|string|null|array|boolean)/)
  })

  it('model names that differ only by case are reported', () => {
    const message = validate({ models: { User: {}, user: {} } })
    expect(message).toContain(
      'crud.exposure.models.user: model "user" is a duplicate of "User": model names are case sensitive',
    )
    expect(validate({ models: { user: {} } }, {}, false)).toContain('(did you mean "User"?)')
  })

  it('a validation error writes no file', async () => {
    const mkdir = vi.spyOn(fs, 'mkdir')
    const writeFile = vi.spyOn(fs, 'writeFile')
    try {
      await expect(generateAll({ crud: { exposure: { models: { Usr: {} } } } }, dmmf)).rejects.toThrow(
        'Invalid pothos-codegen configuration',
      )
      expect(writeFile).not.toHaveBeenCalled()
      expect(mkdir).not.toHaveBeenCalled()
    } finally {
      mkdir.mockRestore()
      writeFile.mockRestore()
    }
  })

  it('validates the manifest, inherit and keepInputs shapes', () => {
    expect(validate({ manifest: { path: '' } })).toContain('crud.exposure.manifest.path')
    expect(validate({ manifest: { file: 'x' } })).toContain('unknown key "file"')
    expect(validate({ operations: { inherit: true } })).toContain(
      '"inherit" is only valid in the operations of a model',
    )
    expect(validate({ models: { Post: { operations: { inherit: 'yes' } } } })).toContain('inherit must be a boolean')
    expect(validate({ keepInputs: [1] })).toContain('crud.exposure.keepInputs')
  })

  it('a config that generates no model is an error (autocrud.ts would not compile)', () => {
    const message = validate({ operations: { findMany: [] } }, {}, false)
    expect(message).toContain('crud.exposure: no model is generated')
    expect(message).toContain('models: { User: {} }')
    // every listed model without operations and nobody reaching them: the same
    expect(validate({ operations: [], models: { AuditLog: {} } }, {}, false)).toContain('no model is generated')
    // with crud.disabled nothing is generated anyway
    expect(validate({ operations: { findMany: [] } }, { disabled: true }, false)).toBeUndefined()
    // a model listed is enough
    expect(validate({ operations: { findMany: [] }, models: { User: {} } }, {}, false)).toBeUndefined()
  })

  it('a guarded to-one relation needs a target with a single-field id', () => {
    expect(validate({ models: { Post: { fields: { author: 'guarded' } } } })).toBeUndefined()
  })

  it('keepInputs must name inputs or enums that exist', () => {
    expect(validate({ keepInputs: ['UserCreateInput', 'Role', 'SortOrder'] })).toBeUndefined()
    expect(validate({ keepInputs: ['UserCreatInput'] })).toContain(
      'crud.exposure.keepInputs: "UserCreatInput" is not an input or enum of the schema',
    )
  })
})
