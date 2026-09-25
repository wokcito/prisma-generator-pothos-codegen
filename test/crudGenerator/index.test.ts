import { generateCrud } from '../../src/crudGenerator'
import { getDefaultConfig } from '../../src/utils/config'
import { getSampleDMMF } from '../helpers/getPrismaSchema'

describe('crudGenerator', () => {
  it('should generate all files', async () => {
    const dmmf = await getSampleDMMF('complex')
    const defaultConfig = getDefaultConfig()
    await generateCrud(defaultConfig, dmmf)
  })
})
