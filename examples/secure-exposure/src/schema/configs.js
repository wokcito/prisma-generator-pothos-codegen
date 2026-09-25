const { defineExposure } = require('@wokcito/prisma-generator-pothos-codegen/runtime')

/**
 * What the schema exposes. Nothing here knows how permissions work: the tags (`loggedIn`, `canRead`) are resolved by
 * the functions of `src/security.ts`.
 */
const exposure = defineExposure({
  // Every model: only reads, each with its tags. `createOne`, `updateOne`... do not exist
  operations: {
    findMany: ['loggedIn', 'canRead'],
    findUnique: ['loggedIn', 'canRead'],
    count: ['canRead'],
  },
  // No `take` above 50, in root queries and in list relations. `count` is not limited
  maxTake: 50,
  models: {
    User: {
      fields: {
        passwordHash: 'hidden', // does not exist: not in the object nor in any input
        tokens: 'hidden',
        email: 'guarded', // nullable, `fieldAccess` decides per row
        phone: ['guarded', 'unfilterable'], // and it can not be filtered nor sorted by
        role: 'readonly',
      },
      // The global operations without `count`
      operations: { inherit: true, count: false },
    },
    Post: {
      fields: { author: 'guarded', comments: 'hidden', published: 'readonly' },
      // Only permissions: the login is not required to read posts
      operations: { findMany: 'canRead', findUnique: 'canRead', count: 'canRead' },
    },
    // AuditLog, AuthToken and Comment are not here: what is not listed has no operations, and nothing visible
    // reaches them (User.tokens and Post.comments are hidden), so they are not generated at all
  },
})

module.exports = {
  crud: {
    outputDir: './src/schema/__generated__/',
    inputsImporter: "import * as Inputs from '@/schema/__generated__/inputs'",
    deleteOutputDirBeforeGenerate: true,
    exportEverythingInObjectsDotTs: false,
    prismaImporter: `import { Prisma } from '@/generated/prisma';`,
    exposure,
  },
  inputs: {
    prismaImporter: `import { Prisma } from '@/generated/prisma';`,
    outputFilePath: './src/schema/__generated__/inputs.ts',
    simple: true,
  },
  global: {
    builderLocation: './src/schema/builder',
  },
}
