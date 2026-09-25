import { execFileSync } from 'node:child_process'
import type { ExtendedGeneratorOptions } from '../../src/generator'
import * as config from '../../src/utils/config'
import { getSampleDMMF } from '../helpers/getPrismaSchema'

const cwd = process.cwd()

const generateOptions = async (generatorConfigPath?: string): Promise<ExtendedGeneratorOptions> => {
  const dmmf = await getSampleDMMF('simple')

  return {
    datamodel: '',
    datasources: [],
    generator: {
      name: 'pothosCrud',
      provider: {
        fromEnvVar: null,
        value: 'tsx ../../src/generator.ts',
      },
      output: {
        value: `${cwd}/test/fixtures/generated/inputs.ts`,
        fromEnvVar: 'null',
      },
      config: {},
      binaryTargets: [],
      previewFeatures: [],
      sourceFilePath: `${cwd}/test/fixtures/simpleSchema.prisma`,
    },
    generatorConfigPath,
    dmmf,
    otherGenerators: [
      {
        name: 'client',
        provider: { fromEnvVar: null, value: 'prisma-client-js' },
        output: {
          value: `${cwd}/test/fixtures/@prisma/client`,
          fromEnvVar: null,
        },
        config: {},
        binaryTargets: [],
        previewFeatures: [],
        sourceFilePath: `${cwd}/test/fixtures/simpleSchema.prisma`,
      },
      {
        name: 'pothos',
        provider: { fromEnvVar: null, value: 'prisma-pothos-types' },
        output: {
          value: `${cwd}/test/fixtures/generated/objects.d.ts`,
          fromEnvVar: null,
        },
        config: { clientOutput: '.prisma/client' },
        binaryTargets: [],
        previewFeatures: [],
        isCustomOutput: true,
        sourceFilePath: `${cwd}/test/fixtures/simpleSchema.prisma`,
      },
    ],
    schemaPath: `${cwd}/test/fixtures/simpleSchema.prisma`,
    version: '272861e07ab64f234d3ffc4094e32bd61775599c',
  } satisfies ExtendedGeneratorOptions
}

const matchImport = expect.stringMatching(/^import /)
const matchRelativePath = expect.stringMatching(/^\.\//)

afterEach(() => {
  delete process.env.POTHOS_CRUD_CONFIG_PATH
})

describe('getConfigPath', () => {
  const { getConfigPath } = config

  it('should return undefined', async () => {
    expect(
      getConfigPath({
        generatorConfigPath: undefined,
        schemaPath: '.',
      }),
    ).toBeUndefined()
  })

  it('should return `POTHOS_CRUD_CONFIG_PATH`', async () => {
    const configPath = '../config-file-env'
    process.env.POTHOS_CRUD_CONFIG_PATH = configPath

    expect(
      getConfigPath({
        generatorConfigPath: undefined,
        schemaPath: '.',
      }),
    ).toBe(configPath)
  })

  it('should return `generatorConfigPath`', async () => {
    const generatorConfigPath = '../config-file-path'

    expect(
      getConfigPath({
        generatorConfigPath,
        schemaPath: '.',
      }),
    ).toBe(generatorConfigPath)
  })

  it('should return `POTHOS_CRUD_CONFIG_PATH` over `generatorConfigPath`', async () => {
    const configPath = '../config-file-env'
    process.env.POTHOS_CRUD_CONFIG_PATH = configPath

    expect(
      getConfigPath({
        generatorConfigPath: '../config-file',
        schemaPath: '.',
      }),
    ).toBe(configPath)
  })
})

describe('parseConfig', () => {
  const { parseConfig } = config

  it(`should throw error if the file doesn't exist`, async () => {
    const fileName = './does-not-exist'
    const regexp = /Cannot find module.*does-not-exist/

    await expect(parseConfig(fileName)).rejects.toThrow(regexp)
  })

  it(`should parse the config file`, async () => {
    const configs = await parseConfig('../../test/fixtures/configs')

    expect(configs).toEqual({
      crud: expect.objectContaining({
        deleteOutputDirBeforeGenerate: expect.any(Boolean),
        disabled: expect.any(Boolean),
        excludeResolversContain: expect.arrayContaining([expect.any(String)]),
        outputDir: matchRelativePath,
        prismaCaller: expect.any(String),
      }),
      global: {},
      inputs: expect.objectContaining({
        outputFilePath: matchRelativePath,
        prismaImporter: matchImport,
      }),
    })
  })
})

describe('getImportSpecifier', () => {
  it('an absolute Windows path becomes a file URL (import() reads `C:` as a protocol)', () => {
    expect(config.getImportSpecifier('C:\\Users\\me\\app\\pothos.config.js', true)).toBe(
      'file:///C:/Users/me/app/pothos.config.js',
    )
    expect(config.getImportSpecifier('c:\\my project\\pothos.config.js', true)).toBe(
      'file:///c:/my%20project/pothos.config.js',
    )
  })

  it('an absolute POSIX path becomes a file URL too', () => {
    expect(config.getImportSpecifier('/home/me/app/pothos.config.js', false)).toBe(
      'file:///home/me/app/pothos.config.js',
    )
  })

  it('a relative specifier is left as is', () => {
    expect(config.getImportSpecifier('../../test/fixtures/configs')).toBe('../../test/fixtures/configs')
    expect(config.getImportSpecifier('./pothos.config.js', true)).toBe('./pothos.config.js')
  })

  it('parseConfig loads a config from an absolute path (a file URL under the hood)', async () => {
    const { crud } = await config.parseConfig(`${cwd}/test/fixtures/configs.js`)
    expect(crud).toEqual(expect.objectContaining({ prismaCaller: expect.any(String) }))
  })
})

describe('parseConfig outside vitest', () => {
  // Vitest applies its own CommonJS interop. Node's ESM loader (what `tsx` and the published package use) only detects
  // the named exports of simple `module.exports = { a, b }` forms, so `module.exports = { crud: { ... } }` must be read
  // from the `default` export.
  it.each(['configs.js'])('reads the keys of a `module.exports = { ... }` config (%s) when run with tsx', (file) => {
    const script = `import('./src/utils/config.ts').then(({ parseConfig }) => parseConfig(process.argv[1])).then((c) => console.log(JSON.stringify({ crud: Object.keys(c.crud ?? {}), inputs: Object.keys(c.inputs ?? {}) })))`
    const output = execFileSync(process.execPath, ['--import', 'tsx', '-e', script, `${cwd}/test/fixtures/${file}`], {
      cwd,
      encoding: 'utf-8',
    })
    const keys = JSON.parse(output.trim().split('\n').pop() as string)

    expect(keys.crud).toContain('outputDir')
    expect(keys.crud).toContain('prismaCaller')
  })
})

describe('getConfig', () => {
  const { getConfig } = config

  it(`should return the default config if a configPath doesn't exist`, async () => {
    const options = await generateOptions()
    const configs = await getConfig(options)

    expect(configs).toEqual({
      crud: expect.objectContaining({
        deleteOutputDirBeforeGenerate: false,
        disabled: false,
        excludeResolversContain: [],
        excludeResolversExact: [],
        generateAutocrud: true,
        includeResolversContain: [],
        includeResolversExact: [],
        inputsImporter: `import * as Inputs from '../inputs';`,
        outputDir: './generated',
        prismaCaller: '_context.prisma',
        prismaImporter: `import { Prisma } from '.prisma/client';`,
        replacer: expect.any(Function),
      }),
      global: expect.objectContaining({
        afterGenerate: expect.any(Function),
        beforeGenerate: expect.any(Function),
        replacer: expect.any(Function),
      }),
      inputs: expect.objectContaining({
        excludeScalars: [],
        outputFilePath: './generated/inputs.ts',
        prismaImporter: `import { Prisma } from '.prisma/client';`,
        replacer: expect.any(Function),
      }),
    })
  })

  it(`should return custom configuration merged with the defaults`, async () => {
    const options = await generateOptions('./configs.js')
    const configs = await getConfig(options)

    expect(configs).toEqual({
      crud: expect.objectContaining({
        deleteOutputDirBeforeGenerate: true,
        disabled: false,
        excludeResolversContain: ['User'],
        excludeResolversExact: [],
        generateAutocrud: true,
        includeResolversContain: [],
        includeResolversExact: [],
        inputsImporter: `import * as Inputs from '../inputs';`,
        outputDir: './src/schema/__generated__/',
        prismaCaller: '_context.db',
        prismaImporter: `import { Prisma } from '.prisma/client';`,
        replacer: expect.any(Function),
        resolverImports: '',
      }),
      global: expect.objectContaining({
        afterGenerate: expect.any(Function),
        beforeGenerate: expect.any(Function),
        replacer: expect.any(Function),
      }),
      inputs: expect.objectContaining({
        excludeScalars: [],
        outputFilePath: './src/schema/__generated__/inputs.ts',
        prismaImporter: `import { Prisma } from '.prisma/client';`,
        replacer: expect.any(Function),
      }),
    })
  })
})
