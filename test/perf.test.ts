import { getDMMF } from '@prisma/internals'
import { withAllModels } from './helpers/exposureHelpers'
import { generateAll } from './helpers/helpers'

/** A schema with `count` models, each with a relation to the next one */
const bigSchema = (count: number) => `
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client-js"
}

${Array.from({ length: count }, (_, i) => {
  const next = (i + 1) % count
  return `model M${i} {
  id Int @id @default(autoincrement())
  name String
  createdAt DateTime @default(now())
  meta Json?
  next M${next} @relation("R${i}", fields: [nextId], references: [id])
  nextId Int
  prev M${(i + count - 1) % count}[] @relation("R${(i + count - 1) % count}")
}`
}).join('\n')}
`

describe('performance', () => {
  it('generating 100 models takes a bounded time', async () => {
    const dmmf = await getDMMF({ datamodel: bigSchema(100) })
    const start = performance.now()
    const files = await generateAll(
      { crud: { exposure: withAllModels({ maxTake: 50, operations: { findMany: 'canRead', count: [] } }, dmmf) } },
      dmmf,
    )
    const elapsed = performance.now() - start
    expect(Object.keys(files).length).toBeGreaterThan(300)
    expect(elapsed).toBeLessThan(30_000)
  }, 60_000)

  it('inputs.ts of 100 models is much smaller with pruning', async () => {
    const dmmf = await getDMMF({ datamodel: bigSchema(100) })
    const plain = await generateAll({}, dmmf)
    const pruned = await generateAll(
      { crud: { exposure: withAllModels({ operations: ['findMany', 'count'] }, dmmf) } },
      dmmf,
    )
    const size = (files: Record<string, string>) => (files['./generated/inputs.ts'] ?? '').length
    expect(size(plain)).toBeGreaterThan(0)
    expect(size(pruned)).toBeLessThan(size(plain) * 0.35)
  }, 60_000)
})
