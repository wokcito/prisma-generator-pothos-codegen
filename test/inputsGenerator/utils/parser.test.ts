import { parseComment } from '../../../src/inputsGenerator/utils/parser'

describe('parseComment', () => {
  test('Check all possible inputs', async () => {
    expect(parseComment(`test`)).toMatchInlineSnapshot(`null`)
    expect(parseComment(`@Pothos.omit(create, update) createdAt description`)).toMatchInlineSnapshot(`
      [
        "create",
        "update",
      ]
    `)
    expect(parseComment(`@Pothos.omit()`)).toMatchInlineSnapshot(`"all"`)
    expect(parseComment(`@Pothos.omit(create)`)).toMatchInlineSnapshot(`
      [
        "create",
      ]
    `)
    expect(parseComment(`@Pothos.omit(create,update,)`)).toMatchInlineSnapshot(`
      [
        "create",
        "update",
      ]
    `)
    expect(parseComment(`@Pothos.omit(create,update,`)).toMatchInlineSnapshot(`null`)
    expect(parseComment(`@Pothos.omit(create,updatex)`)).toMatchInlineSnapshot(`null`)
    expect(parseComment(`test @Pothos.omit(create,update) test`)).toMatchInlineSnapshot(`
      [
        "create",
        "update",
      ]
    `)
  })
})
