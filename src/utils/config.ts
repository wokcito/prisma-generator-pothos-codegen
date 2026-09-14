import type { Replacer } from './replacer'

/** Interface used to configure generator behavior (Prisma 8 contract-based). */
export interface Config {
  /** Input type generation config */
  inputs?: {
    /** How to import the contract types (e.g. `import type { Contract } from '../prisma/contract';`). Default: `"import type { Contract } from './prisma/contract';"` */
    contractTypesImporter?: string
    /** Path to generate the inputs file to from project root. Default: `'./generated/inputs.ts'` */
    outputFilePath?: string
    /** List of excluded scalars from generated output */
    excludeScalars?: string[]
    /** A function to replace generated source. Combined with global replacer config */
    replacer?: Replacer<'inputs'>
    /** Map all id fields (primary key + uniques used in WhereUnique inputs) to GraphQL "ID" scalar.
     *
     * ATTENTION: Mapping non String requires a conversion inside resolver, once GraphQl ID Input are coerced to String by definition. Default: false */
    mapIdFieldsToGraphqlId?: false | 'WhereUniqueInputs'
  }
  /** CRUD generation config */
  crud?: {
    /** Disable generaton of crud. Default: `false` */
    disabled?: boolean
    /** How to import the inputs. Default `"import * as Inputs from '../inputs';"` */
    inputsImporter?: string
    /** How to import the contract types at the objects.ts file. Default `"import type { Contract } from '../prisma/contract';"`. */
    contractTypesImporter?: string
    /** How to reach the Prisma 8 client from the resolver context. Default `'_context.db'` (used as `_context.db.orm.<namespace>.<Model>`) */
    dbCaller?: string
    /** Any additional imports you might want to add to the resolvers (e.g. your db client). Default: `''` */
    resolverImports?: string
    /** Directory to generate crud code into from project root. Default: `'./generated'` */
    outputDir?: string
    /** A function to replace generated source. Combined with global replacer config */
    replacer?: Replacer<'crud'>
    /** A boolean to enable/disable generation of `autocrud.ts` which can be imported in schema root to auto generate all crud objects, queries and mutations. Default: `true` */
    generateAutocrud?: boolean
    /** An array of parts of resolver names to be excluded from generation. Ie: ["User"] Default: [] */
    excludeResolversContain?: string[]
    /** An array of resolver names to be excluded from generation. Ie: ["upsertOneComment"] Default: [] */
    excludeResolversExact?: string[]
    /** An array of parts of resolver names to be included from generation (to bypass exclude contain). Ie: if exclude ["User"], include ["UserReputation"] Default: [] */
    includeResolversContain?: string[]
    /** An array of resolver names to be included from generation (to bypass exclude contain). Ie: if exclude ["User"], include ["UserReputation"] Default: [] */
    includeResolversExact?: string[]
    /** Caution: This delete the whole folder (Only use if the folder only has auto generated contents). A boolean to delete output dir before generate. Default: False */
    deleteOutputDirBeforeGenerate?: boolean
    /** Export all crud queries/mutations/objects in objects.ts at root dir. Default: true */
    exportEverythingInObjectsDotTs?: boolean
    /** Map all id fields to Graphql "ID" Scalar. Default: 'Objects' */
    mapIdFieldsToGraphqlId?: false | 'Objects'
    /** Change the generated variables from object.base.ts from something like `UserName` to `User_Name`. This avoids generated duplicated names in some cases. Default: False */
    underscoreBetweenObjectVariableNames?: false | 'Objects'
  }
  /** Global config */
  global?: {
    /** A function to replace generated source */
    replacer?: Replacer
    /** Run function before generate */
    beforeGenerate?: (schema: unknown) => void
    /** Run function after generate */
    afterGenerate?: (schema: unknown) => void
    /** Location of builder. Default: './builder', */
    builderLocation?: string
  }
}

/** Type representing a configuration filled with default values where the original config was missing them, for internal purposes */
export type ConfigInternal = {
  inputs: NonNullable<Required<Config['inputs']>>
  crud: NonNullable<Required<Config['crud']>>
  global: NonNullable<Required<Config['global']>>
}

/** Resolves the configuration file path from the CLI option or env var */
export const getConfigPath = ({ configPath }: { configPath?: string }): string | undefined => {
  const envConfigPath = process.env.POTHOS_CRUD_CONFIG_PATH
  return envConfigPath || configPath // use env var if set
}

/** Parses the configuration file at the given path */
export const parseConfig = async (configPath: string): Promise<Config> => {
  const importedFile = await import(configPath) // throw error if dont exist
  const { crud, global, inputs }: Config = importedFile || {}

  return { crud, global, inputs }
}

export const getDefaultConfig: () => ConfigInternal = () => ({
  inputs: {
    contractTypesImporter: `import type { Contract } from './prisma/contract';`,
    outputFilePath: './generated/inputs.ts',
    excludeScalars: [],
    replacer: (str: string) => str,
    mapIdFieldsToGraphqlId: false,
  },
  crud: {
    disabled: false,
    inputsImporter: `import * as Inputs from '../inputs';`,
    contractTypesImporter: `import type { Contract } from '../prisma/contract';`,
    dbCaller: '_context.db',
    resolverImports: '',
    outputDir: './generated',
    replacer: (str: string) => str,
    generateAutocrud: true,
    excludeResolversContain: [],
    excludeResolversExact: [],
    includeResolversContain: [],
    includeResolversExact: [],
    deleteOutputDirBeforeGenerate: false,
    exportEverythingInObjectsDotTs: true,
    mapIdFieldsToGraphqlId: 'Objects',
    underscoreBetweenObjectVariableNames: false,
  },
  global: {
    replacer: (str: string) => str,
    builderLocation: './builder',
    beforeGenerate: () => {
      // noop
    },
    afterGenerate: () => {
      // noop
    },
  },
})

/** Loads the config file (if any), fills out the default values, and returns it */
export const getConfig = async (options: { configPath?: string }): Promise<ConfigInternal> => {
  const configPath = getConfigPath(options)

  if (!configPath) return getDefaultConfig()

  const { inputs, crud, global } = await parseConfig(configPath)
  const defaultConfig = getDefaultConfig()

  return {
    inputs: { ...defaultConfig.inputs, ...inputs },
    crud: { ...defaultConfig.crud, ...crud },
    global: { ...defaultConfig.global, ...global },
  } satisfies ConfigInternal
}
