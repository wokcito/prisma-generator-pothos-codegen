import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DMMF } from '@prisma/generator-helper'
import type { ExtendedGeneratorOptions } from '../generator'
import type { Replacer } from './replacer'

/** Resolver operations that `crud.exposure.operations` can enable */
export type ExposureOperation =
  | 'findMany'
  | 'findUnique'
  | 'findFirst'
  | 'count'
  | 'createOne'
  | 'createMany'
  | 'updateOne'
  | 'updateMany'
  | 'upsertOne'
  | 'deleteOne'
  | 'deleteMany'

/** What a field is allowed to do. A field without state is visible, writable and filterable, as in 1.0.0 */
export type ExposureState = 'unfilterable' | 'readonly' | 'guarded' | 'hidden'

/**
 * Enabled operations. A list enables them without tags; an object gives each one a tag (or several) that the
 * application resolves at runtime; `false` (or omitting it) leaves it out. In a model, `inherit: true` starts from the
 * global `operations` instead of from nothing.
 */
export type ExposureOperations =
  | ExposureOperation[]
  | ({ inherit?: boolean } & Partial<Record<ExposureOperation, boolean | string | string[]>>)

export type ExposureModel = {
  /** State (or states) of the scalar fields and relations of the model. Ie: `{ passwordHash: 'hidden', email: 'guarded' }` */
  fields?: Record<string, ExposureState | ExposureState[]>
  /** Operations of this model. Replaces the global ones unless it has `inherit: true` */
  operations?: ExposureOperations
  /** Maximum `take` of `findMany` and of the list relations that return rows of this model. Overrides the global one */
  maxTake?: number
}

/** Access exposure of the generated schema. Every key is optional: what is not mentioned does not change */
export type ExposureConfig = {
  /** Operations of every model, unless the model overrides them. Default: all of them */
  operations?: ExposureOperations
  /** Maximum `take` of `findMany` and of list relations, unless the model overrides it. Default: not limited */
  maxTake?: number
  /** Where the manifest is written. Default: `<crud.outputDir>/exposure.manifest.json` */
  manifest?: { path: string }
  /** Names (of inputs and enums) to keep in `inputs.ts` although no generated operation reaches them, for your own resolvers */
  keepInputs?: string[]
  models?: Record<string, ExposureModel>
}

/** Interface used to configure generator behavior */
export interface Config {
  /** Input type generation config */
  inputs?: {
    /** Create simpler inputs for easier customization and ~65% less generated code. Default: `false` */
    simple?: boolean
    /** How to import the Prisma namespace. Default: `"import { Prisma } from '.prisma/client';"` */
    prismaImporter?: string
    /** Path to generate the inputs file to from project root. Default: `'./generated/inputs.ts'` */
    outputFilePath?: string
    /** List of excluded scalars from generated output */
    excludeScalars?: string[]
    /** A function to replace generated source. Combined with global replacer config */
    replacer?: Replacer<'inputs'>
    /** Map all Prisma fields with "@id" attribute to Graphql "ID" Scalar.
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
    /** How to import the Prisma namespace at the objects.ts file. Default `"import { Prisma } from '.prisma/client';"`. Please use "resolverImports" to import prismaClient at resolvers. */
    prismaImporter?: string
    /** How to call the prisma client. Default `'_context.prisma'` */
    prismaCaller?: string
    /** Any additional imports you might want to add to the resolvers (e.g. your prisma client). Default: `''` */
    resolverImports?: string
    /** Directory to generate crud code into from project root. Default: `'./generated'` */
    outputDir?: string
    /** A function to replace generated source. Combined with global replacer config */
    replacer?: Replacer<'crud'>
    /** A boolean to enable/disable generation of `autocrud.ts` which can be imported in schema root to auto generate all crud objects, queries and mutations. Default: `true` */
    generateAutocrud?: boolean
    /**
     * An array of parts of resolver names to be excluded from generation. Ie: ["User"] Default: []
     * @deprecated Use `crud.exposure.operations` (and `models`), which decides the operations of each model. Still works when `exposure.operations` is not used; using both is an error.
     */
    excludeResolversContain?: string[]
    /**
     * An array of resolver names to be excluded from generation. Ie: ["upsertOneComment"] Default: []
     * @deprecated Use `crud.exposure.operations` (and `models`), which decides the operations of each model. Still works when `exposure.operations` is not used; using both is an error.
     */
    excludeResolversExact?: string[]
    /**
     * An array of parts of resolver names to be included from generation (to bypass exclude contain). Ie: if exclude ["User"], include ["UserReputation"] Default: []
     * @deprecated Use `crud.exposure.operations` (and `models`), which decides the operations of each model. Still works when `exposure.operations` is not used; using both is an error.
     */
    includeResolversContain?: string[]
    /**
     * An array of resolver names to be included from generation (to bypass exclude contain). Ie: if exclude ["User"], include ["UserReputation"] Default: []
     * @deprecated Use `crud.exposure.operations` (and `models`), which decides the operations of each model. Still works when `exposure.operations` is not used; using both is an error.
     */
    includeResolversExact?: string[]
    /** Caution: This delete the whole folder (Only use if the folder only has auto generated contents). A boolean to delete output dir before generate. Default: False */
    deleteOutputDirBeforeGenerate?: boolean
    /** Export all crud queries/mutations/objects in objects.ts at root dir. Default: true */
    exportEverythingInObjectsDotTs?: boolean
    /** Map all Prisma fields with "@id" attribute to Graphql "ID" Scalar. Default: 'Objects' */
    mapIdFieldsToGraphqlId?: false | 'Objects'
    /** Change the generated variables from object.base.ts from something like `UserName` to `User_Name`. This avoids generated duplicated names in some cases. See [issue #58](https://github.com/Cauen/prisma-generator-pothos-codegen/issues/58). Default: False */
    underscoreBetweenObjectVariableNames?: false | 'Objects'
    /** Restrict what the generated schema exposes: operations, field states and `take`. Default: not set (everything is generated, as in 1.0.0) */
    exposure?: ExposureConfig
  }
  /** Global config */
  global?: {
    /** A function to replace generated source */
    replacer?: Replacer
    /** Run function before generate */
    beforeGenerate?: (dmmf: DMMF.Document) => void
    /** Run function after generate */
    afterGenerate?: (dmmf: DMMF.Document) => void
    /** Location of builder. Default: './builder', */
    builderLocation?: string
  }
}

/** Type representing a configuration filled with default values where the original config was missing them, for internal purposes */
export type ConfigInternal = {
  inputs: NonNullable<Required<Config['inputs']>>
  /** `exposure` has no default: when absent the generated code is the same as in 1.0.0 */
  crud: Required<Omit<NonNullable<Config['crud']>, 'exposure'>> & Pick<NonNullable<Config['crud']>, 'exposure'>
  global: NonNullable<Required<Config['global']>>
}

/** Parses the configuration file path */
export const getConfigPath = ({
  generatorConfigPath,
  schemaPath,
}: {
  generatorConfigPath?: string
  schemaPath: string
}): string | undefined => {
  const envConfigPath = process.env.POTHOS_CRUD_CONFIG_PATH
  const configPath = envConfigPath || generatorConfigPath // use env var if set

  if (!configPath) return undefined

  const schemaDirName = path.dirname(schemaPath)
  const optionsPath = path.join(schemaDirName, configPath)

  return optionsPath
}

/**
 * `import()` needs a URL for absolute paths: on Windows `C:\\...` is read as a `c:` protocol
 * (`ERR_UNSUPPORTED_ESM_URL_SCHEME`). A relative specifier is left as is. `windows` is only for tests, by default the
 * platform decides.
 */
export const getImportSpecifier = (configPath: string, windows?: boolean): string => {
  const isAbsolute =
    windows === undefined
      ? path.isAbsolute(configPath)
      : windows
        ? path.win32.isAbsolute(configPath)
        : path.posix.isAbsolute(configPath)
  return isAbsolute ? pathToFileURL(configPath, { windows }).href : configPath
}

/** Parses the configuration file based on the provided schema and config paths */
export const parseConfig = async (configPath: string): Promise<Config> => {
  const importedFile = await import(getImportSpecifier(configPath)) // throw error if dont exist
  // A CommonJS file (`module.exports = { crud: { ... } }`) imported from ESM only exposes its named exports when Node
  // can detect them statically, which it can't for object literals: read them from the `default` export (module.exports)
  const source = importedFile?.default && typeof importedFile.default === 'object' ? importedFile.default : undefined
  const { crud, global, inputs }: Config = { ...importedFile, ...source }

  return { crud, global, inputs }
}

export const getDefaultConfig: (global?: Config['global']) => ConfigInternal = () => ({
  inputs: {
    simple: false,
    prismaImporter: `import { Prisma } from '.prisma/client';`,
    outputFilePath: './generated/inputs.ts',
    excludeScalars: [],
    replacer: (str: string) => str,
    mapIdFieldsToGraphqlId: false,
  },
  crud: {
    disabled: false,
    inputsImporter: `import * as Inputs from '../inputs';`,
    prismaImporter: `import { Prisma } from '.prisma/client';`,
    prismaCaller: '_context.prisma',
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

/** Receives the config path from generator options, loads the config from file, fills out the default values, and returns it */
export const getConfig = async (extendedGeneratorOptions: ExtendedGeneratorOptions): Promise<ConfigInternal> => {
  const { generatorConfigPath, schemaPath } = extendedGeneratorOptions
  const configPath = getConfigPath({ generatorConfigPath, schemaPath })

  if (!configPath) return getDefaultConfig()

  const { inputs, crud, global } = await parseConfig(configPath)
  const defaultConfig = getDefaultConfig(global)

  return {
    inputs: { ...defaultConfig.inputs, ...inputs },
    crud: { ...defaultConfig.crud, ...crud },
    global: { ...defaultConfig.global, ...global },
  } satisfies ConfigInternal
}
