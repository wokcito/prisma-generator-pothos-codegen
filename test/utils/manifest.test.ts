import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import pkg from '../../package.json'
import type { ExposureConfig } from '../../src/utils/config'
import { normalizeExposure } from '../../src/utils/exposureConfig'
import { buildManifest, getExposureReport } from '../../src/utils/manifest'
import { exposureDMMF, file, generateExposure, withAllModels } from '../helpers/exposureHelpers'
import { generateAll, mergeConfig } from '../helpers/helpers'

const config: ExposureConfig = {
  operations: { findMany: ['loggedIn', 'canRead'], findUnique: 'canRead', count: [] },
  maxTake: 50,
  models: {
    User: {
      fields: {
        passwordHash: 'hidden',
        tokens: 'hidden',
        email: 'guarded',
        phone: ['guarded', 'unfilterable'],
        role: 'readonly',
      },
      operations: { inherit: true, count: false },
    },
    Post: { fields: { author: 'guarded', comments: 'hidden', published: 'readonly' }, maxTake: 10 },
    AuditLog: { operations: [] },
  },
}

const manifestOf = async (exposure: ExposureConfig) => {
  const dmmf = await exposureDMMF()
  const all = withAllModels(exposure, dmmf)
  const normalized = normalizeExposure(all, dmmf)
  if (!normalized) throw new Error('no exposure')
  return buildManifest(mergeConfig({ crud: { exposure: all } }), normalized, dmmf)
}

describe('manifest', () => {
  it('exposure.manifest.json has the states, operations and tags of each model', async () => {
    const files = await generateExposure(config)
    const manifest = JSON.parse(file(files, 'exposure.manifest.json'))
    expect(manifest.version).toBe(1)
    expect(manifest.models.User.operations).toEqual({ findMany: ['loggedIn', 'canRead'], findUnique: ['canRead'] })
    expect(manifest.models.Post.operations).toEqual({
      findMany: ['loggedIn', 'canRead'],
      findUnique: ['canRead'],
      count: [],
    })
    expect(manifest.models.User.fields.email).toEqual({ kind: 'scalar', type: 'String', states: ['guarded'] })
    expect(manifest.models.User.fields.phone.states).toEqual(['unfilterable', 'guarded'])
    expect(manifest.models.User.fields.passwordHash.states).toEqual(['hidden'])
    // A model with no operations that nothing reaches is not in the manifest
    expect(manifest.models.AuditLog).toBeUndefined()
  })

  it('the order is deterministic: two runs give the same file', async () => {
    const a = file(await generateExposure(config), 'exposure.manifest.json')
    const b = file(await generateExposure(JSON.parse(JSON.stringify(config))), 'exposure.manifest.json')
    expect(a).toBe(b)
    // models in the order of the schema, operations in a fixed order whatever the order of the config
    const shuffled = file(
      await generateExposure({
        operations: { count: [], findUnique: 'canRead', findMany: ['loggedIn', 'canRead'] },
        maxTake: 50,
      }),
      'exposure.manifest.json',
    )
    expect(Object.keys(JSON.parse(shuffled).models.Post.operations)).toEqual(['findMany', 'findUnique', 'count'])
    expect(Object.keys(JSON.parse(a).models)).toEqual([
      'User',
      'Post',
      'Comment',
      'AuthToken',
      'AppClientAuth',
      'Pair',
      'Typed',
      'Bridge',
      'Omitted',
    ])
  })

  it('relations have isList, targetModel and fromFields', async () => {
    const { models } = await manifestOf(config)
    expect(models.Post?.fields.author).toEqual({
      kind: 'relation',
      targetModel: 'User',
      isList: false,
      fromFields: ['authorId'],
      states: ['guarded'],
    })
    expect(models.Post?.fields.comments).toEqual({
      kind: 'relation',
      targetModel: 'Comment',
      isList: true,
      fromFields: [],
      states: ['hidden'],
    })
  })

  it('the effective maxTake of each model', async () => {
    const { models } = await manifestOf(config)
    expect(models.Post?.maxTake).toBe(10)
    expect(models.User?.maxTake).toBe(50)
    const without = await manifestOf({ operations: ['findMany'] })
    expect(without.models.Post).not.toHaveProperty('maxTake')
  })

  it('the report lists the models that use the default exposure', async () => {
    const dmmf = await exposureDMMF()
    const exposure = normalizeExposure(withAllModels(config, dmmf), dmmf)
    expect(getExposureReport(exposure as never)).toEqual([
      'Models using default exposure: Comment, AuthToken, AppClientAuth, Pair, Typed, Bridge, Omitted',
      'Models not generated (no operations, and no visible relation reaches them): AuditLog',
    ])
  })

  it('the report never fails the generation and includes the warnings', async () => {
    const dmmf = await exposureDMMF()
    const exposure = normalizeExposure(withAllModels({ operations: { findMany: ['a', 'a'] } }, dmmf), dmmf)
    const lines = getExposureReport(exposure as never)
    expect(lines.some((line) => line.startsWith('Warning: crud.exposure.operations.findMany: repeated tag'))).toBe(true)
    await expect(generateExposure({ operations: { findMany: ['a', 'a'] } })).resolves.toBeDefined()
  })

  it('the path of the manifest is configurable', async () => {
    const files = await generateExposure({ manifest: { path: './out/exposure.json' }, maxTake: 5 })
    expect(files['./out/exposure.json']).toBeDefined()
    expect(files['generated/exposure.manifest.json']).toBeUndefined()
    expect(files['generated/exposure.ts']).toBeDefined()
  })

  it('without exposure there is no manifest, no exposure.ts and no types', async () => {
    const files = await generateAll({}, await exposureDMMF())
    expect(Object.keys(files).filter((name) => /exposure/.test(name))).toEqual([])
  })

  it('exposure.types.ts has the real models and fields', async () => {
    const types = file(await generateExposure({}), 'exposure.types.ts')
    expect(types).toContain('export type ExposureConfig = {')
    expect(types).toContain('    User?: {\n      fields?: {\n        id?: ExposureState | ExposureState[];')
    expect(types).toContain('        passwordHash?: ExposureState | ExposureState[];')
    expect(types).toContain("export type ExposureState = 'unfilterable' | 'readonly' | 'guarded' | 'hidden';")
    expect(types).toContain('    Omitted?: {')
  })

  it('the manifest embedded in exposure.ts is the same as the json', async () => {
    const files = await generateExposure(config)
    const embedded = file(files, 'exposure.ts').match(/registerManifest\(([\s\S]*)\);\n$/)?.[1]
    expect(JSON.parse(embedded as string)).toEqual(JSON.parse(file(files, 'exposure.manifest.json')))
  })

  it('with the legacy excludeResolvers* the manifest lists what is generated, without tags', async () => {
    const files = await generateExposure(
      { maxTake: 5 },
      { crud: { excludeResolversContain: ['AuditLog', 'upsertOne'] } },
    )
    const manifest = JSON.parse(file(files, 'exposure.manifest.json'))
    expect(manifest.models.AuditLog.operations).toEqual({})
    expect(Object.keys(manifest.models.Post.operations)).not.toContain('upsertOne')
    expect(manifest.models.Post.operations.findMany).toEqual([])
  })

  it('the generator version comes from package.json', async () => {
    const manifest = JSON.parse(file(await generateExposure({}), 'exposure.manifest.json'))
    expect(manifest.generator).toBe(pkg.version)
  })
})

describe('exposure.types.ts', () => {
  const tscOf = async (sample: string): Promise<string> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exposure-types-'))
    try {
      fs.writeFileSync(path.join(dir, 'exposure.types.ts'), file(await generateExposure({}), 'exposure.types.ts'))
      fs.writeFileSync(
        path.join(dir, 'sample.ts'),
        `import type { ExposureConfig } from './exposure.types'\n${sample}\nexport {}\n`,
      )
      fs.writeFileSync(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: 'ES2019',
            module: 'esnext',
            moduleResolution: 'bundler',
            types: [],
          },
          include: ['*.ts'],
        }),
      )
      execFileSync(path.resolve(__dirname, '../../node_modules/.bin/tsc'), ['-p', dir], {
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      return ''
    } catch (error) {
      return String((error as { stdout?: string }).stdout ?? error)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  it('the type rejects a field that does not exist, and a model that does not exist', async () => {
    expect(await tscOf("const a: ExposureConfig = { models: { User: { fields: { emial: 'hidden' } } } }")).toMatch(
      /emial/,
    )
    expect(await tscOf('const a: ExposureConfig = { models: { Usr: {} } }')).toMatch(/Usr/)
    expect(await tscOf("const a: ExposureConfig = { models: { User: { fields: { email: 'secret' } } } }")).toMatch(
      /secret/,
    )
    expect(await tscOf('const a: ExposureConfig = { operations: { findAll: [] } }')).toMatch(/findAll/)
  })

  it('the type accepts every state and every valid combination', async () => {
    expect(
      await tscOf(`const a: ExposureConfig = {
  operations: { findMany: ['loggedIn', 'canRead'], findUnique: 'canRead', count: [], createOne: true, deleteMany: false },
  maxTake: 50,
  manifest: { path: './x.json' },
  keepInputs: ['UserCreateInput'],
  models: {
    User: {
      fields: { passwordHash: 'hidden', email: 'guarded', phone: ['guarded', 'unfilterable'], role: 'readonly', posts: ['readonly', 'unfilterable'] },
      operations: { inherit: true, count: false },
      maxTake: 10,
    },
    AuditLog: { operations: [] },
    Post: { operations: ['findMany', 'updateOne'] },
  },
}`),
    ).toBe('')
  })
})
