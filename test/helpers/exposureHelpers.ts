import type { DMMF } from '@prisma/generator-helper'
import type { Config, ExposureConfig } from '../../src/utils/config'
import { getSampleDMMF } from './getPrismaSchema'
import { generateAll } from './helpers'

let cached: DMMF.Document | undefined
export const exposureDMMF = async () => (cached ??= await getSampleDMMF('exposure'))

/**
 * With `operations`, a model that is not in `models` is not generated. Most tests want the global operations on every
 * model: this lists them all (`models: { X: {} }`), keeping what the config says about the ones it mentions.
 */
export const withAllModels = (exposure: ExposureConfig, dmmf: DMMF.Document): ExposureConfig => ({
  ...exposure,
  models: { ...Object.fromEntries(dmmf.datamodel.models.map((m) => [m.name, {}])), ...exposure.models },
})

/** Generates everything for the exposure fixtures with the given exposure (and other crud options) */
export const generateExposure = async (
  exposure: ExposureConfig | undefined,
  overrides: Config = {},
  { allModels = true }: { allModels?: boolean } = {},
): Promise<Record<string, string>> => {
  const dmmf = await exposureDMMF()
  const config = exposure && allModels ? withAllModels(exposure, dmmf) : exposure
  return generateAll(
    { ...overrides, crud: { ...overrides.crud, ...(config === undefined ? {} : { exposure: config }) } },
    dmmf,
  )
}

export const file = (files: Record<string, string>, name: string): string => {
  const found = files[`generated/${name}`] ?? files[`./generated/${name}`] ?? files[name]
  if (found === undefined)
    throw new Error(`${name} was not generated. Some of what was: ${Object.keys(files).slice(0, 8).join(', ')}`)
  return found
}
