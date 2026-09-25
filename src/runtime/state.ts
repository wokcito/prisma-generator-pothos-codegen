import type { ExposureManifest, ExposureRuntime, Guard } from './types'

type State = {
  manifest?: ExposureManifest
  runtime?: ExposureRuntime
  /** Guards per `<Model>.<operation>`: computed once when the setup is validated (or at first use), not per request */
  guards: Map<string, Guard[]>
}

// Kept on `globalThis` so the ESM and CJS builds (and duplicated installs) of the package share a single state
const key = Symbol.for('@wokcito/prisma-generator-pothos-codegen/runtime/state')

export const getState = (): State => {
  const holder = globalThis as unknown as Record<symbol, State | undefined>
  let state = holder[key]
  if (!state) {
    state = { guards: new Map() }
    holder[key] = state
  }
  return state
}

export const toArray = <F>(slot: F | F[] | undefined): F[] =>
  slot === undefined ? [] : Array.isArray(slot) ? slot : [slot]
