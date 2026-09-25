import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    // A single copy of `graphql` (Pothos and the test must share the same classes)
    server: { deps: { inline: [/graphql/, /@pothos/, /prisma-generator-pothos-codegen/] } },
    // The runtime keeps its state on globalThis: files must not share it
    isolate: true,
  },
})
