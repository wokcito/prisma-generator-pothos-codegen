import fs from 'node:fs/promises'
import type { ContractJson } from './types'

/** Loads and validates a Prisma 8 `contract.json` file. */
export const loadContractFile = async (filePath: string): Promise<ContractJson> => {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch {
    throw new Error(`Prisma 8 contract not found: ${filePath}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid Prisma 8 contract (not JSON): ${filePath}`)
  }

  if (!isContractJson(parsed)) {
    throw new Error(
      `Invalid Prisma 8 contract: expected { domain.namespaces, storage, roots } in ${filePath}. ` +
        `Generate it with \`prisma contract emit\`.`,
    )
  }

  return parsed
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isContractJson = (value: unknown): value is ContractJson => {
  if (!isRecord(value)) return false
  if (!isRecord(value.domain) || !isRecord(value.domain.namespaces)) return false
  if (!isRecord(value.storage)) return false
  if (!isRecord(value.roots)) return false
  return true
}
