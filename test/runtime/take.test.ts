import { clampTake } from '../../src/runtime/take'

describe('clampTake', () => {
  it.each([
    [undefined, 50, 50],
    [1000, 50, 50],
    [-1000, 50, -50],
    [0, 50, 0],
    [3, 50, 3],
    [-3, 50, -3],
    [null, 50, 50],
    [50, 50, 50],
    [-50, 50, -50],
  ])('clampTake(%j, %j) = %j', (take, max, expected) => {
    expect(clampTake(take as number | undefined | null, max)).toBe(expected)
  })
})
