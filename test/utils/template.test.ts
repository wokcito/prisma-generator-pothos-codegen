import { useTemplate } from '../../src/utils/template'

describe('useTemplate', () => {
  it('replaces every occurrence of a variable', () => {
    expect(useTemplate('#{a}-#{b}-#{a}', { a: '1', b: '2' })).toBe('1-2-1')
  })

  it('skips the listed variables so they can be resolved later', () => {
    expect(useTemplate('#{a}-#{b}', { a: '1' }, ['b' as const])).toBe('1-#{b}')
  })

  it('inserts values literally: `$` replacement patterns are not interpreted', () => {
    expect(useTemplate('x #{code} y', { code: "a('$&', \"$'\", '$$', '$`', '$1')" })).toBe(
      "x a('$&', \"$'\", '$$', '$`', '$1') y",
    )
  })

  it('is unchanged for values without `$`', () => {
    expect(useTemplate('#{a}\n  #{b}', { a: 'one\ntwo', b: '' })).toBe('one\ntwo\n  ')
  })
})
