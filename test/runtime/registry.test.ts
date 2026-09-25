import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { byTag } from '../../src/runtime/byTag'
import {
  assertExposureConfigured,
  configureExposure,
  getManifest,
  registerManifest,
  resetExposureForTests,
} from '../../src/runtime/registry'
import { blogManifest, manifestOf, model, relation, scalar } from './test-utils'

beforeEach(() => resetExposureForTests())

const guard = () => {}
const fullRuntime = {
  guards: byTag({ canRead: () => guard }),
  scope: () => undefined,
  fieldAccess: () => true,
  fieldScope: () => undefined,
}

describe('package', () => {
  it('the runtime has no dependencies: it only imports its own files', () => {
    const dir = path.join(__dirname, '../../src/runtime')
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(path.join(dir, name), 'utf-8')
      for (const [, from] of source.matchAll(/from '([^']+)'/g)) expect(from, name).toMatch(/^\.\//)
    }
  })

  it('the package exports the runtime (compiled by tsc, importable from ESM and CJS)', () => {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'))
    expect(pkg.exports['./runtime'].default).toBe('./src/runtime/index.js')
  })
})

describe('registration', () => {
  it('registerManifest stores it and resetExposureForTests clears it', () => {
    const manifest = blogManifest()
    registerManifest(manifest)
    expect(getManifest()).toBe(manifest)
    resetExposureForTests()
    expect(getManifest()).toBeUndefined()
  })

  it('rejects a manifest of another version', () => {
    expect(() => registerManifest({ ...blogManifest(), version: 2 as never })).toThrow(/version 2/)
  })

  it('configureExposure twice: the second replaces the first', () => {
    const calls: string[] = []
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: ['a'] }) }))
    configureExposure({ guards: (t) => (calls.push('first'), t.tags.map(() => guard)) })
    configureExposure({ guards: (t) => (calls.push('second'), t.tags.map(() => guard)) })
    expect(calls).toEqual(['first', 'second'])
  })

  it('configureExposure before registerManifest validates when the manifest arrives', () => {
    configureExposure({ guards: byTag({}) })
    expect(() => registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: ['missing'] }) }))).toThrow(
      /Tag "missing" used by Post.findMany has no guard/,
    )
  })

  it('without configureExposure and a manifest with no tags nor guarded fields is fine', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: [], count: [] }) }))
    expect(() => assertExposureConfigured()).not.toThrow()
  })

  it('without configureExposure and with tags assertExposureConfigured throws', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: ['canRead'] }) }))
    expect(() => assertExposureConfigured()).toThrow(/configureExposure was not called/)
  })

  it('assertExposureConfigured throws when guarded fields exist and nothing is configured', () => {
    registerManifest(blogManifest())
    expect(() => assertExposureConfigured()).toThrow(/configureExposure was not called/)
  })

  it('assertExposureConfigured throws without a manifest', () => {
    expect(() => assertExposureConfigured()).toThrow(/manifest is not registered/)
  })
})

describe('startup validation', () => {
  it('fails with a tag without factory', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: ['loggedIn'] }) }))
    expect(() => configureExposure({ guards: byTag({ canRead: () => guard }) })).toThrow(
      'Tag "loggedIn" used by Post.findMany has no guard',
    )
  })

  it('fails with a guarded field without fieldAccess', () => {
    registerManifest(blogManifest())
    expect(() => configureExposure({ fieldScope: () => undefined })).toThrow(
      /User\.email is guarded but no fieldAccess/,
    )
  })

  it('fails with fieldAccess but no fieldScope', () => {
    registerManifest(blogManifest())
    expect(() => configureExposure({ fieldAccess: () => true })).toThrow(
      /fieldAccess is configured but fieldScope is not/,
    )
  })

  it('fails with a guarded to-one relation without scope', () => {
    registerManifest(
      manifestOf({
        Post: model({ id: scalar(), author: relation('User', false, ['guarded'], ['authorId']) }),
        User: model({ id: scalar() }),
      }),
    )
    expect(() => configureExposure({})).toThrow(/Post\.author is a guarded to-one relation but no scope/)
    expect(() => configureExposure({ scope: () => undefined })).not.toThrow()
  })

  it('reports every problem together', () => {
    registerManifest(
      manifestOf({
        Post: model({ id: scalar(), body: scalar(['guarded']) }, { findMany: ['a'], count: ['b'] }),
      }),
    )
    let message = ''
    try {
      configureExposure({ guards: byTag({}) })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('Tag "a" used by Post.findMany')
    expect(message).toContain('Tag "b" used by Post.count')
    expect(message).toContain('Post.body is guarded but no fieldAccess')
  })

  it('messages name model, field, operation and tag', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar(), body: scalar(['guarded']) }, { updateOne: ['owner'] }) }))
    expect(() => configureExposure({})).toThrow(/Post\.updateOne has tags \[owner\] but no guards are configured/)
    expect(() => configureExposure({ guards: byTag({}) })).toThrow(/Tag "owner" used by Post\.updateOne/)
  })

  it('passes with everything configured', () => {
    registerManifest(blogManifest())
    expect(() => configureExposure(fullRuntime)).not.toThrow()
    expect(() => assertExposureConfigured()).not.toThrow()
  })

  it('passes with nothing to configure', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: [] }) }))
    expect(() => configureExposure({})).not.toThrow()
  })

  it('fails with upsertOne enabled and scope configured', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { upsertOne: [] }) }))
    expect(() => configureExposure({ scope: () => undefined })).toThrow(
      'upsertOne on model Post cannot be scoped: its create branch has no where. Remove it from operations',
    )
  })

  it('an upsertOne with only guards (tags) is valid', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { upsertOne: ['canWrite'] }) }))
    expect(() => configureExposure({ guards: byTag({ canWrite: () => guard }) })).not.toThrow()
  })

  it('a failed validation leaves no guards cached', () => {
    registerManifest(manifestOf({ Post: model({ id: scalar() }, { findMany: ['x'] }) }))
    expect(() => configureExposure({ guards: byTag({}) })).toThrow()
  })

  it('configureExposure with 100 models x 11 operations is fast', () => {
    const operations = Object.fromEntries(
      [
        'findMany',
        'findUnique',
        'findFirst',
        'count',
        'createOne',
        'createMany',
        'updateOne',
        'updateMany',
        'deleteOne',
        'deleteMany',
        'upsertOne',
      ].map((op) => [op, ['t']]),
    )
    const models = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`M${i}`, model({ id: scalar() }, operations as never)]),
    )
    registerManifest(manifestOf(models))
    const start = performance.now()
    configureExposure({ guards: byTag({ t: () => guard }) })
    expect(performance.now() - start).toBeLessThan(500)
  })
})
