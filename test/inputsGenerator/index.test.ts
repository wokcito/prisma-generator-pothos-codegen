import { generateInputs } from '../../src/inputsGenerator'
import { getDefaultConfig } from '../../src/utils/config'
import { getSampleDMMF } from '../helpers/getPrismaSchema'

describe('inputsGenerator', () => {
  it('should generate inputs', async () => {
    const dmmf = await getSampleDMMF('complex')
    const defaultConfig = getDefaultConfig()
    await generateInputs(defaultConfig, dmmf)
  })
})
