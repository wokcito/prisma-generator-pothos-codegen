// /** @type {import('prisma-generator-pothos-codegen').Config} */

/** @type {import('../utils/config').Config} */
module.exports = {
  crud: {
    outputDir: './src/schema/__generated__/',
    excludeResolversContain: ['User'],
    dbCaller: '_context.db',
    disabled: false,
    // inputsImporter: "import * as Inputs from '@/schema/inputs'",
    deleteOutputDirBeforeGenerate: true,
  },
  inputs: {
    contractTypesImporter: `import type { Contract } from '../prisma/contract';`,
    outputFilePath: './src/schema/__generated__/inputs.ts',
  },
  global: {},
}
