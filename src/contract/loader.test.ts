import path from 'node:path'
import { loadContractFile } from './loader'
import type { ContractJson } from './types'

const simpleContractPath = path.join(__dirname, 'fixtures/simple/generated/contract.json')
const complexContractPath = path.join(__dirname, 'fixtures/complex/generated/contract.json')

const publicNamespace = (contract: ContractJson) => contract.domain.namespaces.public!

describe('loadContractFile', () => {
  it('loads the simple contract fixture', async () => {
    const contract = await loadContractFile(simpleContractPath)

    expect(contract.target).toBe('postgres')
    expect(Object.keys(publicNamespace(contract).models)).toEqual(expect.arrayContaining(['User', 'Post']))
  })

  it('loads the complex contract fixture', async () => {
    const contract = await loadContractFile(complexContractPath)

    const models = Object.keys(publicNamespace(contract).models)
    expect(models).toEqual(
      expect.arrayContaining(['User', 'Post', 'Comment', 'Profile', 'Follow', 'Unrelated', 'WithScalars']),
    )
    expect(Object.keys(publicNamespace(contract).enum ?? {})).toContain('Role')
  })

  it('throws when the file does not exist', async () => {
    await expect(loadContractFile(path.join(__dirname, 'does-not-exist.json'))).rejects.toThrow()
  })

  it('throws on invalid JSON', async () => {
    await expect(loadContractFile(__filename)).rejects.toThrow(/contract/i)
  })

  it('throws when the JSON is not a Prisma 8 contract', async () => {
    const tmp = path.join(__dirname, 'fixtures/simple/contract.prisma')
    await expect(loadContractFile(tmp)).rejects.toThrow(/contract/i)
  })
})
