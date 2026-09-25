import fs from 'node:fs/promises'
import type { DMMF } from '@prisma/generator-helper'
import { generateCrud } from '../../src/crudGenerator'
import { generateInputs } from '../../src/inputsGenerator'
import { type Config, type ConfigInternal, getDefaultConfig } from '../../src/utils/config'

/** Mirrors the merge done by `getConfig`, without loading a config file */
export const mergeConfig = (overrides: Config = {}): ConfigInternal => {
  const defaults = getDefaultConfig()
  return {
    inputs: { ...defaults.inputs, ...overrides.inputs },
    crud: { ...defaults.crud, ...overrides.crud },
    global: { ...defaults.global, ...overrides.global },
  }
}

/**
 * Runs both generators without touching the disk (fs is spied) and returns every generated file
 * keyed by path, sorted so the result is deterministic.
 */
export const generateAll = async (overrides: Config, dmmf: DMMF.Document): Promise<Record<string, string>> => {
  const files: Record<string, string> = {}
  const mkdir = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined)
  const writeFile = vi.spyOn(fs, 'writeFile').mockImplementation(async (location, content) => {
    files[String(location)] = String(content)
  })
  try {
    const config = mergeConfig(overrides)
    await generateCrud(config, dmmf)
    await generateInputs(config, dmmf)
  } finally {
    mkdir.mockRestore()
    writeFile.mockRestore()
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/** Serializes generated files into a single, diffable string (used by golden files) */
export const serializeFiles = (files: Record<string, string>): string =>
  Object.entries(files)
    .map(([location, content]) => `//// FILE: ${location}\n${content}`)
    .join('\n')
