import path from 'node:path'
import type { ConfigInternal } from '../utils/config'

/** Computes the `import builder from '...'` line relative to the generated file. */
export const getBuilderCalculatedImport = ({
  config,
  fileLocation,
}: {
  config: ConfigInternal
  fileLocation: string
}): string => {
  const fromDir = path.dirname(fileLocation)
  let relative = path.relative(fromDir, config.global.builderLocation).replace(/\\/g, '/')
  if (!relative.startsWith('.')) relative = `./${relative}`
  return `import builder from '${relative}';`
}
