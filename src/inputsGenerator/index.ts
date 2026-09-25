import type { DMMF } from '@prisma/generator-helper'
import { env } from '../env'
import type { ConfigInternal } from '../utils/config'
import { normalizeExposure } from '../utils/exposureConfig'
import { validateExposure } from '../utils/exposureValidation'
import { writeFile } from '../utils/filesystem'
import { getEnums, getImports, getInputs, getScalars, getUtil } from './utils/parts'

/** Types may vary between Prisma versions */
export type Scalars<DecimalType, JsonInput, JsonOutput> = {
  DateTime: {
    Input: Date
    Output: Date
  }
  Decimal: {
    Input: DecimalType
    Output: DecimalType
  }
  BigInt: {
    Input: bigint
    Output: bigint
  }
  Json: {
    Input: JsonInput
    Output: JsonOutput
  }
  Bytes: {
    /** Prisma returns `Uint8Array` for Bytes fields since Prisma 6; Buffer is also a Uint8Array so both are accepted */
    Input: Buffer | Uint8Array
    Output: {
      type: 'Buffer'
      data: number[]
    }
  }
  NEVER: {
    Input: void
    Output: void
  }
}

export async function generateInputs(config: ConfigInternal, dmmf: DMMF.Document): Promise<void> {
  validateExposure(config, dmmf)

  if (env.isTesting) await writeFile(config, 'debug.dmmf', JSON.stringify(dmmf, null, 2), 'dmmf.json')

  const fileLocation = config.inputs.outputFilePath

  const imports = getImports(config, fileLocation)
  const util = getUtil()
  const exposure = normalizeExposure(config.crud.exposure, dmmf)
  const inputs = getInputs(config, dmmf, exposure)
  const scalars = getScalars(config, dmmf, exposure ? inputs.used : undefined)
  const enums = getEnums(dmmf, exposure, inputs.enums)
  const content = [imports, util, scalars, enums, inputs.code].join('\n\n')

  await writeFile(config, 'inputs', content, fileLocation)
}
