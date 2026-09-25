import { canReadField } from '../../src/runtime/canReadField'
import { configureExposure, resetExposureForTests } from '../../src/runtime/registry'

beforeEach(() => resetExposureForTests())

const email = { model: 'User', field: 'email' }

describe('canReadField', () => {
  it('uses fieldAccess', () => {
    configureExposure({ fieldAccess: (_t, parent, ctx) => parent.id === ctx.viewerId })
    expect(canReadField(email, { id: 1, email: 'a' }, { viewerId: 1 })).toBe(true)
    expect(canReadField(email, { id: 2, email: 'b' }, { viewerId: 1 })).toBe(false)
  })

  it('without runtime it is false (fail closed)', () => {
    expect(canReadField(email, { id: 1, email: 'a' }, {})).toBe(false)
  })

  it('memoizes per context and row', () => {
    const fn = vi.fn(() => true)
    configureExposure({ fieldAccess: fn })
    const ctx = {}
    const row = { email: 'a' }
    for (let i = 0; i < 5; i++) canReadField(email, row, ctx)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('the cache is not shared between requests', () => {
    const fn = vi.fn(() => true)
    configureExposure({ fieldAccess: fn })
    const row = { email: 'a' }
    canReadField(email, row, {})
    canReadField(email, row, {})
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('two rows with the same values are not confused', () => {
    configureExposure({ fieldAccess: (_t, parent) => parent.owner === true })
    const ctx = {}
    expect(canReadField(email, { email: 'a', owner: true }, ctx)).toBe(true)
    expect(canReadField(email, { email: 'a', owner: false }, ctx)).toBe(false)
  })

  it('a parent without the field (partial selection) is false', () => {
    const fn = vi.fn(() => true)
    configureExposure({ fieldAccess: fn })
    expect(canReadField(email, { id: 1 }, {})).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('a null parent is false', () => {
    configureExposure({ fieldAccess: () => true })
    expect(canReadField(email, null, {})).toBe(false)
  })

  it('does not memoize when the context or the parent are not objects', () => {
    const fn = vi.fn(() => true)
    configureExposure({ fieldAccess: fn })
    canReadField({ model: 'User', field: null }, { a: 1 }, undefined)
    canReadField({ model: 'User', field: null }, { a: 1 }, undefined)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('a function that throws propagates and is not cached', () => {
    let fail = true
    configureExposure({
      fieldAccess: () => {
        if (fail) throw new Error('boom')
        return true
      },
    })
    const ctx = {}
    const row = { email: 'a' }
    expect(() => canReadField(email, row, ctx)).toThrow('boom')
    fail = false
    expect(canReadField(email, row, ctx)).toBe(true)
  })

  it('50 x 50 rows x 2 fields call the user function once per row and field', () => {
    const fn = vi.fn(() => true)
    configureExposure({ fieldAccess: fn })
    const ctx = {}
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i, email: 'e', phone: 'p' }))
    for (let repeat = 0; repeat < 50; repeat++)
      for (const row of rows) {
        canReadField(email, row, ctx)
        canReadField({ model: 'User', field: 'phone' }, row, ctx)
      }
    expect(fn).toHaveBeenCalledTimes(100)
  })
})
