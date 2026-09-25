import SchemaBuilder from '@pothos/core'
import PrismaPlugin from '@pothos/plugin-prisma'
import { Scalars } from '../../../../src'
import type { Ctx } from '../context'
import PrismaTypes, { getDatamodel } from '../generated/objects'
import type { Prisma } from '../generated/prisma'

export const builder = new SchemaBuilder<{
  Context: Ctx
  PrismaTypes: PrismaTypes
  Scalars: Scalars<Prisma.Decimal, Prisma.InputJsonValue | null, Prisma.InputJsonValue>
}>({
  plugins: [PrismaPlugin],
  // The client comes from the context, so the resolvers (and the tests) decide which one is used
  prisma: { client: (ctx) => ctx.prisma, dmmf: getDatamodel() },
})
