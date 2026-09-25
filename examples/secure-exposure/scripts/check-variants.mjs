// Generates the example with each variant of `variants/` and type checks the result (strict), then restores the default.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = (name) => path.join(root, 'node_modules/.bin', name)
// The generators of the schema (`pothos`) are launched by name: node_modules/.bin must be in the PATH
const PATH = `${path.join(root, 'node_modules/.bin')}${path.delimiter}${process.env.PATH}`
const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd: root, env: { ...process.env, PATH, ...env }, stdio: 'pipe', encoding: 'utf-8' })

const variants = fs.readdirSync(path.join(root, 'variants')).filter((f) => f.endsWith('.js') && f !== 'base.js')
let failed = false
try {
  for (const variant of variants) {
    run(bin('prisma'), ['generate'], { POTHOS_CRUD_CONFIG_PATH: `../variants/${variant}` })
    try {
      // The variants generate a schema the tests of the example do not know: only the app files and the generated code
      run(bin('tsc'), ['--noEmit', '-p', 'tsconfig.variants.json'])
      console.log(`ok   ${variant}`)
    } catch (error) {
      failed = true
      console.log(`FAIL ${variant}\n${error.stdout ?? error}`)
    }
  }
} finally {
  run(bin('prisma'), ['generate'])
}
process.exit(failed ? 1 : 0)
