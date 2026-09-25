import { denyEmptyOr, matchNothing } from '../../src/runtime/deny'
import { resetExposureForTests } from '../../src/runtime/registry'
import { manifestOf, model, relation, scalar, setup } from './test-utils'

beforeEach(() => resetExposureForTests())

describe('matchNothing', () => {
  it('uses id when the model has a scalar id that supports in', () => {
    setup(manifestOf({ A: model({ flag: scalar([], 'Boolean'), id: scalar([], 'Int') }) }))
    expect(matchNothing('A')).toEqual({ id: { in: [] } })
  })

  it('skips Boolean, Json and scalar lists', () => {
    setup(
      manifestOf({
        A: model({
          flag: scalar([], 'Boolean'),
          meta: scalar([], 'Json'),
          tags: { kind: 'scalar', type: 'String', states: [], isList: true },
          code: scalar([], 'String'),
        }),
      }),
    )
    expect(matchNothing('A')).toEqual({ code: { in: [] } })
  })

  it('falls back to id when the model is not in the manifest', () => {
    setup(manifestOf({}))
    expect(matchNothing('Ghost')).toEqual({ id: { in: [] } })
  })
})

describe('denyEmptyOr', () => {
  beforeEach(() =>
    setup(
      manifestOf({
        A: model({ id: scalar([], 'Int'), b: relation('B', false), cs: relation('C', true) }),
        B: model({ key: scalar([], 'String') }),
        C: model({ id: scalar([], 'Int') }),
      }),
    ),
  )

  it('replaces a node with an empty OR, whatever else it has', () => {
    expect(denyEmptyOr('A', { id: 1, OR: [] })).toEqual({ id: { in: [] } })
  })

  it('uses the fields of the model of each relation', () => {
    expect(denyEmptyOr('A', { b: { is: { OR: [] } }, cs: { none: { OR: [] } }, AND: [{ b: { OR: [] } }] })).toEqual({
      b: { is: { key: { in: [] } } },
      cs: { none: { id: { in: [] } } },
      AND: [{ b: { key: { in: [] } } }],
    })
  })

  it('leaves alone an OR that has conditions, and returns the same object when nothing changes', () => {
    const where = { OR: [{ id: 1 }], b: { is: { key: 'x' } } }
    expect(denyEmptyOr('A', where)).toBe(where)
  })

  it('does not mutate its input', () => {
    const where = { AND: [{ OR: [] }] }
    const snapshot = JSON.parse(JSON.stringify(where))
    denyEmptyOr('A', where)
    expect(where).toEqual(snapshot)
  })

  it('rejects an absurdly deep scope instead of exhausting the stack', () => {
    let where: Record<string, unknown> = { id: 1 }
    for (let i = 0; i < 2000; i++) where = { AND: [where] }
    expect(() => denyEmptyOr('A', where)).toThrow(/nested too deeply/)
  })
})
