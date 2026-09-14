import { getDMMF } from '@prisma/internals'
import fs from 'fs'
import path from 'path'

const simplePrismaSchema = fs.readFileSync(path.join(__dirname, './simpleSchema.prisma'), 'utf-8')
const complexPrismaSchema = fs.readFileSync(path.join(__dirname, './complexSchema.prisma'), 'utf-8')

export const getSampleDMMF = async (type: 'complex' | 'simple') => {
  const datamodel = type === 'complex' ? complexPrismaSchema : simplePrismaSchema

  return getDMMF({
    datamodel,
  })
}
