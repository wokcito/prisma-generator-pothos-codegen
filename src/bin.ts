#!/usr/bin/env node
import { runFromContract } from './cli'

const args = process.argv.slice(2)

const getFlag = (name: string): string | undefined => {
  const index = args.findIndex((arg) => arg === name || arg.startsWith(`${name}=`))
  if (index === -1) return undefined
  const arg = args[index] as string
  if (arg.includes('=')) return arg.split('=').slice(1).join('=')
  return args[index + 1]
}

const contractPath = getFlag('--contract')
const configPath = getFlag('--config')
const dryRun = args.includes('--dry-run')

if (!contractPath || args.includes('--help') || args.includes('-h')) {
  // eslint-disable-next-line no-console
  console.log(`prisma-generator-pothos-codegen (Prisma 8)

Usage:
  prisma-generator-pothos-codegen --contract <path-to-contract.json> [--config <path-to-config>] [--dry-run]

The contract.json file is emitted by Prisma 8 with \`prisma contract emit\`.
Generated code targets Pothos + @pothos/plugin-prisma-next (contract-first ORM client).
`)
  process.exit(contractPath ? 0 : 1)
}

runFromContract({ contractPath, configPath, dryRun }).catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
})
