import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type RunOptions, runFromContract } from './cli'
import type { GeneratedFile } from './crudGenerator'

const complexContractPath = path.join(__dirname, 'contract/fixtures/complex/generated/contract.json')

describe('runFromContract (end to end)', () => {
  let dryRun!: { inputs: string; crud: GeneratedFile[] }

  beforeAll(async () => {
    const options: RunOptions = { contractPath: complexContractPath, dryRun: true }
    dryRun = await runFromContract(options)
  })

  it('dry-run returns inputs + crud without touching disk', () => {
    expect(dryRun.inputs).toContain(`builder.inputRef`)
    expect(dryRun.inputs).toContain('UserWhereInput')
    expect(dryRun.crud.length).toBeGreaterThan(10)
    expect(dryRun.crud.map((f) => f.path)).toEqual(
      expect.arrayContaining(['objects.ts', 'utils.ts', 'autocrud.ts', 'User/object.base.ts']),
    )
  })

  it('writes generated files under the configured output paths', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pothos-codegen-'))

    try {
      const configPath = path.join(tmp, 'codegen.config.cjs')
      await fs.writeFile(
        configPath,
        `module.exports = {
          inputs: { outputFilePath: ${JSON.stringify(path.join(tmp, 'inputs.ts'))} },
          crud: { outputDir: ${JSON.stringify(path.join(tmp, 'crud'))} },
          global: { builderLocation: ${JSON.stringify(path.join(tmp, 'builder'))} },
        }`,
      )

      const { crud } = await runFromContract({ contractPath: complexContractPath, configPath })

      expect(crud.length).toBeGreaterThan(0)
      expect((await fs.stat(path.join(tmp, 'inputs.ts'))).isFile()).toBe(true)
      expect((await fs.stat(path.join(tmp, 'crud', 'objects.ts'))).isFile()).toBe(true)
      expect((await fs.stat(path.join(tmp, 'crud', 'User', 'queries.ts'))).isFile()).toBe(true)
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })
})
