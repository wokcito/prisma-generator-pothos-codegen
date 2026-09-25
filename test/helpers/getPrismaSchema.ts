import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/internals'
import fs from 'fs'
import path from 'path'

const simplePrismaSchema = fs.readFileSync(path.join(__dirname, '../fixtures/simpleSchema.prisma'), 'utf-8')
const complexPrismaSchema = fs.readFileSync(path.join(__dirname, '../fixtures/complexSchema.prisma'), 'utf-8')
const exposurePrismaSchema = fs.readFileSync(path.join(__dirname, '../fixtures/exposureSchema.prisma'), 'utf-8')

const schemas = { complex: complexPrismaSchema, simple: simplePrismaSchema, exposure: exposurePrismaSchema }

export const getSampleDMMF = async (type: keyof typeof schemas): Promise<DMMF.Document> => {
  const datamodel = schemas[type]

  return getDMMF({
    datamodel,
  })
}
