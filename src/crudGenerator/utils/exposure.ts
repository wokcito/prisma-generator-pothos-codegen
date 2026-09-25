import { FLAT_OPERATIONS, type NormalizedExposure, type Operation } from '../../utils/exposureConfig'

type Kind = 'query' | 'mutation'

/** Which of the runtime functions a resolver uses, and how `where` and `take` are built for it */
const operations: Record<Operation, { where?: 'merge'; take?: boolean }> = {
  findFirst: { where: 'merge' }, // `take` must be 1 or -1 in `findFirst`: no cap
  findMany: { where: 'merge', take: true },
  count: { where: 'merge' }, // no cap: a default cap would make counts wrong
  findUnique: { where: 'merge' },
  createMany: {},
  createOne: {},
  deleteMany: { where: 'merge' },
  deleteOne: { where: 'merge' },
  updateMany: { where: 'merge' },
  updateOne: { where: 'merge' },
  upsertOne: {}, // its `create` branch has no where: it can not be scoped
}

/** Variables of the resolver templates. The defaults reproduce the resolvers of 1.0.0 byte by byte */
export type ResolverVariables = {
  objectOpen: string
  objectClose: string
  where: string
  take: string
  runtimeImports: string
}

/** Maximum `take` of the rows a model returns, or `undefined` when it is not limited */
export const getTake = (exposure: NormalizedExposure | undefined, model: string): number | undefined =>
  exposure?.models[model]?.maxTake

const q = (value: string) => `'${value}'`

/** Import of the runtime (a single quote style and a fixed order, so the output is stable) */
export const runtimeImport = (names: string[], effectImport?: string): string => {
  const unique = [...new Set(names)].sort()
  return `\nimport { ${unique.join(', ')} } from '@wokcito/prisma-generator-pothos-codegen/runtime';${effectImport ? `\nimport '${effectImport}';` : ''}`
}

/**
 * Variables that turn a plain resolver into one that goes through the runtime: `withExposure` runs the guards, `mergeScope`
 * builds the `where` and `clampTake` limits `take`. Without `exposure` they are the 1.0.0 ones.
 */
export const getResolverVariables = (
  exposure: NormalizedExposure | undefined,
  model: string,
  operation: Operation,
  kind: Kind,
): ResolverVariables => {
  const plain: ResolverVariables = {
    objectOpen: ' =>\n  ',
    objectClose: '',
    where:
      operation === 'updateMany' || operation === 'findFirst' || operation === 'findMany' || operation === 'count'
        ? 'args.where || undefined'
        : 'args.where',
    take: 'args.take || undefined',
    runtimeImports: '',
  }
  if (!exposure) return plain

  const tags = exposure.models[model]?.operations[operation] ?? []
  const flags = operations[operation]
  const maxTake = getTake(exposure, model)
  const flat = FLAT_OPERATIONS.includes(operation)
  const target = `{ kind: ${q(kind)}, model: ${q(model)}, operation: ${q(operation)}, tags: [${tags.map(q).join(', ')}] }`
  const used = ['withExposure']
  if (flags.where) used.push('mergeScope')
  if (flags.take && maxTake !== undefined) used.push('clampTake')

  return {
    // The wrapper is applied after the object is built, so the resolver keeps the types Pothos infers for it
    objectOpen: ` => {\n  const target = ${target} as const;\n\n  const operation = `,
    objectClose: `;\n\n  return { ...operation, resolve: withExposure(target, operation.resolve, { flat: ${flat} }) };\n}`,
    where: flags.where ? 'mergeScope(target, args, _context)' : plain.where,
    take: flags.take && maxTake !== undefined ? `clampTake(args.take, ${maxTake})` : plain.take,
    runtimeImports: runtimeImport(used, '../../exposure'),
  }
}

/**
 * Value of the `query` option of a list relation, and the code that goes before it. Without `exposure` it is the 1.0.0
 * one. With it the relation is scoped by the runtime, so the query needs the context.
 */
export const getRelationQuery = (
  exposure: NormalizedExposure | undefined,
  { model, field, targetModel }: { model: string; field: string; targetModel: string },
  targetName: string,
): { query: string; prelude: string; runtimeNames: string[] } => {
  const fields = (where: string, take: string, indent: string) =>
    [
      `where: ${where},`,
      'cursor: args.cursor || undefined,',
      `take: ${take},`,
      'distinct: args.distinct || undefined,',
      'skip: args.skip || undefined,',
      'orderBy: args.orderBy || undefined,',
    ].join(`\n${indent}`)

  if (!exposure)
    return {
      query: `(args) => ({\n      ${fields('args.where || undefined', 'args.take || undefined', '      ')}\n    })`,
      prelude: '',
      runtimeNames: [],
    }

  const maxTake = getTake(exposure, targetModel)
  return {
    prelude: `const ${targetName} = { kind: 'relation', model: ${q(model)}, field: ${q(field)}, targetModel: ${q(targetModel)}, isList: true } as const;\n\n`,
    query: `(args, ctx) => ({\n      ${fields(`mergeScope(${targetName}, args, ctx)`, maxTake === undefined ? 'args.take || undefined' : `clampTake(args.take, ${maxTake})`, '      ')}\n    })`,
    runtimeNames: maxTake === undefined ? ['mergeScope'] : ['mergeScope', 'clampTake'],
  }
}
