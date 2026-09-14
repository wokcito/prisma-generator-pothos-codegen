import path from 'node:path'
import { loadContractFile } from '../contract/loader'
import { type SchemaModel, toSchemaModel } from '../contract/schema'
import { getDefaultConfig } from '../utils/config'
import { generateInputs } from '.'

const complexContractPath = path.join(__dirname, '../contract/fixtures/complex/generated/contract.json')

describe('generateInputs (Prisma 8 contract)', () => {
  let schema!: SchemaModel

  beforeAll(async () => {
    schema = toSchemaModel(await loadContractFile(complexContractPath))
  })

  it('generates where/orderBy/unique/create/update inputs per model', () => {
    const content = generateInputs(schema, getDefaultConfig())

    for (const model of ['User', 'Post', 'Comment', 'WithScalars']) {
      expect(content).toContain(`${model}WhereInput`)
      expect(content).toContain(`${model}OrderByWithRelationInput`)
      expect(content).toContain(`${model}WhereUniqueInput`)
      expect(content).toContain(`${model}CreateInput`)
      expect(content).toContain(`${model}UpdateInput`)
    }
  })

  it('emits the Role enum with its members', () => {
    const content = generateInputs(schema, getDefaultConfig())

    expect(content).toContain(`builder.enumType('Role'`)
    expect(content).toContain('USER')
    expect(content).toContain('ADMIN')
  })

  it('registers custom scalars used by the contract', () => {
    const content = generateInputs(schema, getDefaultConfig())

    for (const scalar of ['DateTime', 'Decimal', 'BigInt', 'Json', 'Bytes']) {
      expect(content).toContain(`builder.scalarType('${scalar}'`)
    }
  })

  it('does not reference the Prisma 7 client namespace', () => {
    const content = generateInputs(schema, getDefaultConfig())

    expect(content).not.toContain('.prisma/client')
    expect(content).not.toContain('Prisma.')
  })

  it('maps id fields to GraphQL ID when configured', () => {
    const config = getDefaultConfig()
    config.inputs.mapIdFieldsToGraphqlId = 'WhereUniqueInputs'
    const content = generateInputs(schema, config)

    expect(content).toContain(`'ID'`)
  })

  it('respects excludeScalars', () => {
    const config = getDefaultConfig()
    config.inputs.excludeScalars = ['Json', 'Bytes']
    const content = generateInputs(schema, config)

    expect(content).not.toContain(`builder.scalarType('Json'`)
    expect(content).not.toContain(`builder.scalarType('Bytes'`)
    expect(content).toContain(`builder.scalarType('DateTime'`)
  })
})
