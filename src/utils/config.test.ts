import * as config from './config'

afterEach(() => {
  delete process.env.POTHOS_CRUD_CONFIG_PATH
})

describe('getConfigPath', () => {
  const { getConfigPath } = config

  it('returns undefined when no config path is given', () => {
    expect(getConfigPath({})).toBeUndefined()
  })

  it('prefers POTHOS_CRUD_CONFIG_PATH env var', () => {
    process.env.POTHOS_CRUD_CONFIG_PATH = './config-from-env.js'

    expect(getConfigPath({ configPath: './config-from-arg.js' })).toBe('./config-from-env.js')
  })

  it('returns the configPath argument otherwise', () => {
    expect(getConfigPath({ configPath: './my-codegen.config.js' })).toBe('./my-codegen.config.js')
  })
})

describe('parseConfig', () => {
  const { parseConfig } = config

  it(`throws when the file doesn't exist`, async () => {
    await expect(parseConfig('./does-not-exist')).rejects.toThrow()
  })

  it('parses the fixture config file', async () => {
    const parsed = await parseConfig('../tests/configs')

    expect(parsed).toEqual({
      crud: expect.objectContaining({
        deleteOutputDirBeforeGenerate: expect.any(Boolean),
        excludeResolversContain: expect.arrayContaining([expect.any(String)]),
        outputDir: expect.stringMatching(/^\.\//),
        dbCaller: expect.any(String),
      }),
      global: {},
      inputs: expect.objectContaining({
        outputFilePath: expect.stringMatching(/^\.\//),
      }),
    })
  })
})

describe('getConfig', () => {
  const { getConfig } = config

  it('returns defaults when no config path is given', async () => {
    const result = await getConfig({})

    expect(result).toEqual({
      crud: expect.objectContaining({
        disabled: false,
        dbCaller: '_context.db',
        inputsImporter: `import * as Inputs from '../inputs';`,
        outputDir: './generated',
        generateAutocrud: true,
        excludeResolversContain: [],
        excludeResolversExact: [],
        includeResolversContain: [],
        includeResolversExact: [],
        replacer: expect.any(Function),
      }),
      global: expect.objectContaining({
        afterGenerate: expect.any(Function),
        beforeGenerate: expect.any(Function),
        replacer: expect.any(Function),
        builderLocation: './builder',
      }),
      inputs: expect.objectContaining({
        excludeScalars: [],
        outputFilePath: './generated/inputs.ts',
        contractTypesImporter: expect.stringMatching(/^import /),
        mapIdFieldsToGraphqlId: false,
        replacer: expect.any(Function),
      }),
    })
  })

  it('merges a config file over the defaults', async () => {
    const result = await getConfig({ configPath: '../tests/configs.js' })

    expect(result.crud).toEqual(
      expect.objectContaining({
        deleteOutputDirBeforeGenerate: true,
        excludeResolversContain: ['User'],
        outputDir: './src/schema/__generated__/',
        dbCaller: '_context.db',
      }),
    )
    expect(result.inputs).toEqual(
      expect.objectContaining({
        outputFilePath: './src/schema/__generated__/inputs.ts',
      }),
    )
  })
})
