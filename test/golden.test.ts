import type { Config } from '../src/utils/config'
import { getSampleDMMF } from './helpers/getPrismaSchema'
import { generateAll, serializeFiles } from './helpers/helpers'

/**
 * Backward compatibility : without `crud.exposure` the generated code must stay byte-identical to 1.0.0.
 * The golden files in `./fixtures/golden` were generated with the 1.0.0 generator (the `fixtures-*` ones from its commit, over
 * `exposureSchema.prisma`, which has the models that matter: relations-only, BigInt, Decimal, Json, Bytes, enums, a
 * composite id and every `@Pothos.omit` variant).
 *
 * NEVER run vitest with `-u` on this file: updating the goldens defeats the purpose of the test.
 */
const variants: { name: string; schema: 'complex' | 'simple' | 'exposure'; config: Config }[] = [
  { name: 'fixtures-default', schema: 'exposure', config: {} },
  {
    name: 'fixtures-exclude-contain',
    schema: 'exposure',
    config: { crud: { excludeResolversContain: ['AuditLog', 'count', 'upsertOne'] } },
  },
  {
    name: 'fixtures-exclude-exact',
    schema: 'exposure',
    config: { crud: { excludeResolversExact: ['createOneUser', 'deleteManyPost', 'findFirstComment'] } },
  },
  {
    name: 'fixtures-include-contain',
    schema: 'exposure',
    config: { crud: { includeResolversContain: ['Post', 'Comment'] } },
  },
  {
    name: 'fixtures-include-exact',
    schema: 'exposure',
    config: { crud: { includeResolversExact: ['findManyUser', 'findUniqueUser', 'countPost'] } },
  },
  {
    name: 'fixtures-underscore',
    schema: 'exposure',
    config: { crud: { underscoreBetweenObjectVariableNames: 'Objects' } },
  },
  {
    name: 'fixtures-no-export-everything',
    schema: 'exposure',
    config: { crud: { exportEverythingInObjectsDotTs: false } },
  },
  { name: 'fixtures-map-id-false', schema: 'exposure', config: { crud: { mapIdFieldsToGraphqlId: false } } },
  {
    name: 'fixtures-map-id-where-unique',
    schema: 'exposure',
    config: { inputs: { mapIdFieldsToGraphqlId: 'WhereUniqueInputs' } },
  },
  { name: 'fixtures-simple-inputs', schema: 'exposure', config: { inputs: { simple: true } } },
  {
    name: 'fixtures-no-autocrud',
    schema: 'exposure',
    config: { crud: { generateAutocrud: false, prismaCaller: 'db', resolverImports: "\nimport { db } from '../db';" } },
  },
  { name: 'default-complex', schema: 'complex', config: {} },
  { name: 'default-simple', schema: 'simple', config: {} },
  {
    name: 'underscore-no-export-complex',
    schema: 'complex',
    config: { crud: { underscoreBetweenObjectVariableNames: 'Objects', exportEverythingInObjectsDotTs: false } },
  },
  {
    name: 'simple-inputs-no-id-mapping-complex',
    schema: 'complex',
    config: {
      inputs: { simple: true, mapIdFieldsToGraphqlId: 'WhereUniqueInputs' },
      crud: { mapIdFieldsToGraphqlId: false },
    },
  },
  {
    name: 'custom-caller-and-excludes-complex',
    schema: 'complex',
    config: {
      crud: {
        prismaCaller: 'db',
        resolverImports: `\nimport { db } from '../db';`,
        excludeResolversContain: ['User'],
        includeResolversExact: [],
        generateAutocrud: false,
      },
    },
  },
]

describe('1.0.0 golden files', () => {
  it.each(variants)('generates identical output: $name', async ({ name, schema, config }) => {
    const dmmf = await getSampleDMMF(schema)
    const files = await generateAll(config, dmmf)

    expect(Object.keys(files).length).toBeGreaterThan(10)
    await expect(serializeFiles(files)).toMatchFileSnapshot(`./fixtures/golden/${name}.golden.txt`)
  })
})
