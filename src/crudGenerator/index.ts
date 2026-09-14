import path from 'node:path'
import type { SchemaModel } from '../contract/schema'
import { getBuilderCalculatedImport } from '../utils/builderImport'
import type { ConfigInternal } from '../utils/config'
import { getConfigCrudUnderscore } from '../utils/configUtils'
import { deleteFolder, writeFile } from '../utils/filesystem'
import { useTemplate } from '../utils/template'
import {
  autoCrudTemplate,
  type MutationDef,
  makeMutations,
  makeObjectBase,
  makeQueries,
  objectsTemplate,
  type QueryDef,
  utilsTemplate,
} from './templates'

export interface GeneratedFile {
  path: string
  content: string
}

const resolverName = (operation: string, modelName: string) => `${operation}${modelName}`

const isResolverIncluded = (name: string, crud: ConfigInternal['crud']): boolean => {
  const { excludeResolversContain, excludeResolversExact, includeResolversContain, includeResolversExact } = crud
  if (includeResolversExact.includes(name)) return true
  if (includeResolversContain.some((part) => name.includes(part))) return true
  if (excludeResolversExact.includes(name)) return false
  if (excludeResolversContain.some((part) => name.includes(part))) return false
  return true
}

const renderResolverBody = (root: 'Query' | 'Mutation', def: QueryDef | MutationDef, modelName: string): string => {
  const isPrisma = def.isPrisma
  const object = isPrisma ? 'PrismaObject' : 'Object'
  const field = isPrisma ? 'prismaField' : 'field'
  const operation = def.operation
  return `export const ${operation}${modelName}${root}Args = builder.args((t) => (${useTemplate(def.args, { modelName })}))

export const ${operation}${modelName}${root}Object = define${root}Function((t) =>
  define${root}${object}({
    type: ${useTemplate(def.type, { modelName })},
    nullable: ${def.nullable ? 'true' : 'false'},
    args: ${operation}${modelName}${root}Args,
    resolve: ${def.resolve},
  }),
);

export const ${operation}${modelName}${root} = define${root}((t) => ({
  ${operation}${modelName}: t.${field}(${operation}${modelName}${root}Object(t)),
}));
`
}

const renderResolverFile = (
  root: 'Query' | 'Mutation',
  bodies: string[],
  modelName: string,
  config: ConfigInternal,
): string => {
  const dir = root === 'Query' ? 'queries' : 'mutations'
  const header = [
    config.crud.inputsImporter,
    root === 'Mutation' ? `import { BatchPayload } from '../objects';` : '',
    config.crud.resolverImports,
    getBuilderCalculatedImport({
      config,
      fileLocation: `${config.crud.outputDir}/${modelName}/${dir}.ts`,
    }),
    `import { define${root}, define${root}Function, define${root}Object, define${root}PrismaObject } from '../utils';`,
  ]
    .filter((line) => line.length > 0)
    .join('\n')
  return `${header}\n\n${bodies.join('\n')}`
}

/**
 * Generates CRUD files (Pothos + @pothos/plugin-prisma-next style) from a
 * Prisma 8 contract schema. Pure function (no filesystem access).
 */
export function generateCrud(schema: SchemaModel, config: ConfigInternal): GeneratedFile[] {
  if (config.crud.disabled) return []

  const files: GeneratedFile[] = []
  const underscore = getConfigCrudUnderscore(config)

  const modelEntries: { model: string; queries: string[]; mutations: string[] }[] = []

  for (const model of schema.models) {
    const queries = makeQueries(model, config).filter((q) =>
      isResolverIncluded(resolverName(q.operation, model.name), config.crud),
    )
    const mutations = makeMutations(model, config).filter((m) =>
      isResolverIncluded(resolverName(m.operation, model.name), config.crud),
    )

    files.push({
      path: `${model.name}/object.base.ts`,
      content: makeObjectBase(model, config),
    })

    if (queries.length > 0) {
      files.push({
        path: `${model.name}/queries.ts`,
        content: renderResolverFile(
          'Query',
          queries.map((q) => renderResolverBody('Query', q, model.name)),
          model.name,
          config,
        ),
      })
    }
    if (mutations.length > 0) {
      files.push({
        path: `${model.name}/mutations.ts`,
        content: renderResolverFile(
          'Mutation',
          mutations.map((m) => renderResolverBody('Mutation', m, model.name)),
          model.name,
          config,
        ),
      })
    }

    modelEntries.push({
      model: model.name,
      queries: queries.map((q) => q.operation),
      mutations: mutations.map((m) => m.operation),
    })
  }

  const withResolvers = modelEntries.filter((e) => e.queries.length + e.mutations.length > 0)

  // objects.ts
  const modelNamesEachLine = schema.models.map((m) => `'${m.name}',`).join('\n  ')
  const exportAll = modelEntries
    .map((e) => {
      const exports: string[] = [`${e.model}${underscore}Object`]
      for (const q of e.queries) exports.push(`${q}${e.model}Query`)
      for (const m of e.mutations) exports.push(`${m}${e.model}Mutation`)
      return `export {\n  ${exports.join(',\n  ')}\n} from './${e.model}';`
    })
    .join('\n')
  const fileLocationObjects = path.join(config.crud.outputDir, 'objects.ts')
  files.push({
    path: 'objects.ts',
    content: useTemplate(
      objectsTemplate,
      {
        contractTypesImporter: config.crud.contractTypesImporter,
        crudExportRoot: config.crud.exportEverythingInObjectsDotTs ? `\n${exportAll}` : '',
        modelNames: modelNamesEachLine,
        builderCalculatedImport: getBuilderCalculatedImport({ config, fileLocation: fileLocationObjects }),
      },
      [],
    ),
  })

  // utils.ts
  const fileLocationUtils = path.join(config.crud.outputDir, 'utils.ts')
  files.push({
    path: 'utils.ts',
    content: useTemplate(
      utilsTemplate,
      {
        builderCalculatedImport: getBuilderCalculatedImport({ config, fileLocation: fileLocationUtils }),
      },
      [],
    ),
  })

  // autocrud.ts
  if (config.crud.generateAutocrud) {
    const imports = schema.models.map((m) => `import * as ${m.name} from './${m.name}';`).join('\n')
    const modelsGenerated = withResolvers
      .map((e) => {
        const queries = e.queries.map((q) => `      ${q}: ${e.model}.${q}${e.model}QueryObject,`).join('\n')
        const mutations = e.mutations.map((m) => `      ${m}: ${e.model}.${m}${e.model}MutationObject,`).join('\n')
        return `  ${e.model}: {
    Object: ${e.model}.${e.model}${underscore}Object,
    queries: {
${queries}
    },
    mutations: {
${mutations}
    },
  },`
      })
      .join('\n')
    const fileLocationAutocrud = path.join(config.crud.outputDir, 'autocrud.ts')
    files.push({
      path: 'autocrud.ts',
      content: useTemplate(
        autoCrudTemplate,
        {
          imports,
          modelsGenerated,
          builderCalculatedImport: getBuilderCalculatedImport({
            config,
            fileLocation: fileLocationAutocrud,
          }),
        },
        [],
      ),
    })
  }

  return files
}

/** Generates CRUD files and writes them to `config.crud.outputDir`. */
export async function writeCrud(schema: SchemaModel, config: ConfigInternal): Promise<void> {
  if (config.crud.disabled) return

  if (config.crud.deleteOutputDirBeforeGenerate) await deleteFolder(path.join(config.crud.outputDir))

  for (const file of generateCrud(schema, config)) {
    await writeFile(config, 'crud.model.resolver', file.content, path.join(config.crud.outputDir, file.path))
  }
}
