import { type GeneratorOptions, generatorHandler } from '@prisma/generator-helper'
import { generateCrud } from './crudGenerator'
import { generateInputs } from './inputsGenerator'
import { getConfig } from './utils/config'
import { normalizeExposure } from './utils/exposureConfig'
import { getExposureReport } from './utils/manifest'

// Types from the generator, in `schema.prisma`
type SchemaGeneratorExtensionOptions = { generatorConfigPath?: string }

// default config from generator, with the path option
export type ExtendedGeneratorOptions = SchemaGeneratorExtensionOptions & GeneratorOptions

generatorHandler({
  onManifest: () => ({
    prettyName: 'Pothos inputs & crud integration',
    requiresGenerators: ['prisma-client-js', 'prisma-pothos-types'],
    defaultOutput: './generated/inputs.ts',
  }),
  onGenerate: async (options) => {
    const generatorConfig: ExtendedGeneratorOptions = { ...options, ...options.generator.config }
    const config = await getConfig(generatorConfig)

    config.global.beforeGenerate(options.dmmf)
    await generateCrud(config, options.dmmf)
    await generateInputs(config, options.dmmf)
    const exposure = normalizeExposure(config.crud.exposure, options.dmmf)
    if (exposure) for (const line of getExposureReport(exposure)) console.log(line)
    config.global.afterGenerate(options.dmmf)
  },
})
