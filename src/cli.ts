import { loadContractFile } from './contract/loader'
import { toSchemaModel } from './contract/schema'
import { generateCrud, writeCrud } from './crudGenerator'
import { generateInputs, writeInputs } from './inputsGenerator'
import { getConfig } from './utils/config'

export interface RunOptions {
  /** Path to the Prisma 8 `contract.json` (emitted by `prisma contract emit`). */
  contractPath: string
  /** Optional path to a codegen config file. */
  configPath?: string
  /** When true, files are generated in memory but not written to disk. */
  dryRun?: boolean
}

export const runFromContract = async (options: RunOptions) => {
  const config = await getConfig({ configPath: options.configPath })
  const contract = await loadContractFile(options.contractPath)
  const schema = toSchemaModel(contract)

  config.global.beforeGenerate(schema)

  const inputs = generateInputs(schema, config)
  const crud = generateCrud(schema, config)

  if (!options.dryRun) {
    await writeInputs(schema, config)
    await writeCrud(schema, config)
  }

  config.global.afterGenerate(schema)

  return { inputs, crud }
}
