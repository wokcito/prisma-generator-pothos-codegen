export type ExposureErrorCode = 'FORBIDDEN' | 'INTERNAL'

/**
 * Thrown by the runtime when a request cannot be served safely. `FORBIDDEN` is caused by the client (a filter that
 * would leak data), `INTERNAL` by the setup (a missing manifest or runtime). The application can map `code`.
 */
export class ExposureError extends Error {
  readonly code: ExposureErrorCode

  constructor(code: ExposureErrorCode, message: string) {
    super(message)
    this.name = 'ExposureError'
    this.code = code
  }
}
