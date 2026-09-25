import path from 'node:path'
import type { DMMF } from '@prisma/generator-helper'
import type { ConfigInternal } from '../utils/config'
import { getConfigCrudUnderscore } from '../utils/configUtils'
import { normalizeExposure } from '../utils/exposureConfig'
import { validateExposure } from '../utils/exposureValidation'
import { deleteFolder, writeFile } from '../utils/filesystem'
import { buildManifest, renderExposureFile, renderExposureTypes, renderManifest } from '../utils/manifest'
import { useTemplate } from '../utils/template'
import { autoCrudTemplate, guardedRelationUtils, objectsTemplate, utilsTemplate } from './templates/root'
import { generateModel } from './utils/generator'
import { getBuilderCalculatedImport } from './utils/parts'

export async function generateCrud(config: ConfigInternal, dmmf: DMMF.Document): Promise<void> {
  validateExposure(config, dmmf) // also runs when crud is disabled: it governs the inputs too

  if (config.crud.disabled) return

  const exposure = normalizeExposure(config.crud.exposure, dmmf)

  if (config.crud.deleteOutputDirBeforeGenerate) await deleteFolder(path.join(config.crud.outputDir))

  // A model that has no operations and that no visible relation reaches is not generated at all
  const emittedModels = dmmf.datamodel.models.filter((model) => !exposure || exposure.emittedModels.has(model.name))
  const modelNames = emittedModels.map((model) => model.name)

  // Generate CRUD directories (e.g. User, Comment, ...)
  const generatedModels = await Promise.all(
    modelNames.map(async (model) => {
      const generated = await generateModel(config, dmmf, model, exposure)
      return { model, generated }
    }),
  )
  const exportAllInObjects = generatedModels
    .map((el) => {
      return {
        model: el.model,
        exports: el.generated.index.flatMap((el) => el.exports),
      }
    })
    .filter((el) => Boolean(el.exports.length))

  // Generate root objects.ts file (export all models + prisma objects)
  const modelNamesEachLine = modelNames.map((model) => `'${model}',`).join('\n  ')
  const fileLocationObjects = path.join(config.crud.outputDir, 'objects.ts')
  const builderCalculatedImportObjects = getBuilderCalculatedImport({
    config,
    fileLocation: fileLocationObjects,
  })

  await writeFile(
    config,
    'crud.objects',
    useTemplate(objectsTemplate, {
      crudExportRoot: config.crud.exportEverythingInObjectsDotTs
        ? `\n${exportAllInObjects
            .map((el) => `export {\n  ${el.exports.join(',\n  ')}\n} from './${el.model}';`)
            .join('\n')}`
        : '',
      ...config.crud,
      modelNames: modelNamesEachLine,
      builderCalculatedImport: builderCalculatedImportObjects,
      exposureImport: exposure ? "\nimport './exposure';" : '',
    }),
    fileLocationObjects,
  )

  const fileLocation = path.join(config.crud.outputDir, 'utils.ts')
  const builderCalculatedImport = getBuilderCalculatedImport({ config, fileLocation })

  // Generate root utils.ts file
  await writeFile(
    config,
    'crud.utils',
    useTemplate(utilsTemplate, {
      builderCalculatedImport,
      // Only what a guarded to-one relation needs, and only with `crud.exposure`
      fieldRefImport: exposure ? '  FieldRef,\n' : '',
      exposureUtils: exposure ? guardedRelationUtils : '',
    }),
    fileLocation,
  )

  if (exposure) {
    const manifest = buildManifest(config, exposure, dmmf)
    await writeFile(
      config,
      'crud.exposure',
      renderExposureFile(manifest),
      path.join(config.crud.outputDir, 'exposure.ts'),
    )
    await writeFile(
      config,
      'crud.exposure.types',
      renderExposureTypes(dmmf),
      path.join(config.crud.outputDir, 'exposure.types.ts'),
    )
    await writeFile(
      config,
      'crud.exposure.manifest',
      renderManifest(manifest),
      exposure.manifestPath ?? path.join(config.crud.outputDir, 'exposure.manifest.json'),
    )
  }

  // Generate root autocrud.ts file
  // TODO REFACTOR AND TESTS
  if (config.crud.generateAutocrud) {
    const imports = emittedModels.map((model) => `import * as ${model.name} from './${model.name}';`).join('\n')
    const models = generatedModels.map((el) => ({
      model: el.model,
      generated: el.generated.resolvers,
    }))

    const modelsGenerated = emittedModels
      .map((model) => {
        const { name } = model
        return `  ${name}: {
    Object: ${name}.${name}${getConfigCrudUnderscore(config)}Object,
    queries: ${(() => {
      const queries = models.find((el) => el.model === name)?.generated.filter((el) => el.type === 'queries') || []
      return `{\n${queries
        .map((el) => `      ${el.resolverName}: ${el.modelName}.${el.resolverName}${el.modelName}QueryObject,`)
        .join('\n')}\n    }`
    })()},
    mutations: ${(() => {
      const mutations = models.find((el) => el.model === name)?.generated.filter((el) => el.type === 'mutations') || []
      return `{\n${mutations
        .map((el) => `      ${el.resolverName}: ${el.modelName}.${el.resolverName}${el.modelName}MutationObject,`)
        .join('\n')}\n    }`
    })()},
  },`
      })
      .join('\n')

    const fileLocation = path.join(config.crud.outputDir, 'autocrud.ts')
    const builderCalculatedImport = getBuilderCalculatedImport({ config, fileLocation })

    await writeFile(
      config,
      'crud.autocrud',
      useTemplate(autoCrudTemplate, {
        ...config.crud,
        imports,
        modelsGenerated,
        builderCalculatedImport,
        exposureImport: exposure ? "\nimport './exposure';" : '',
      }),
      fileLocation,
    )
  }
}
