export { byTag } from './byTag'
export { canReadField } from './canReadField'
export { ExposureError, type ExposureErrorCode } from './errors'
export { mergeScope } from './mergeScope'
export { isRowReadable, type RowFinder } from './readable'
export {
  assertExposureConfigured,
  configureExposure,
  registerManifest,
  resetExposureForTests,
} from './registry'
export { clampTake } from './take'
export type * from './types'
export { withExposure } from './withExposure'

import type { ExposureConfigBase } from './types'

/** Identity function that types `crud.exposure` in `pothos.config.js` (use the generated `ExposureConfig` for your models) */
export const defineExposure = <T extends ExposureConfigBase>(config: T): T => config
