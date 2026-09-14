import type { ContractModel, ContractRelation, ContractScalarField } from '../contract/schema'
import { getBuilderCalculatedImport } from '../utils/builderImport'
import type { ConfigInternal } from '../utils/config'
import { getConfigCrudUnderscore } from '../utils/configUtils'
import { useTemplate } from '../utils/template'

const exposeForScalar = (field: ContractScalarField, mapIdToGraphqlId: boolean, isId: boolean): string => {
  if (field.enumName)
    return `t.expose('${field.name}', { type: Inputs.${field.enumName}, nullable: ${field.nullable} })`
  if (mapIdToGraphqlId && isId) return `t.exposeID('${field.name}')`
  switch (field.graphqlScalar) {
    case 'String':
      return `t.exposeString('${field.name}')`
    case 'Int':
      return `t.exposeInt('${field.name}')`
    case 'Float':
      return `t.exposeFloat('${field.name}')`
    case 'Boolean':
      return `t.exposeBoolean('${field.name}')`
    case 'ID':
      return `t.exposeID('${field.name}')`
    default:
      return `t.expose('${field.name}', { type: '${field.graphqlScalar}', nullable: ${field.nullable} })`
  }
}

const identityFieldNames = (model: ContractModel): string[] => {
  const pk = model.primaryKey ?? []
  const singleUniques = model.uniques.filter((u) => u.length === 1).map((u) => u[0] as string)
  return [...new Set([...pk, ...singleUniques])]
}

const relationField = (rel: ContractRelation): string => {
  if (rel.cardinality === '1:N') {
    return `${rel.name}: t.relation('${rel.name}', {
      args: {
        where: t.arg({ type: Inputs.${rel.targetModel}WhereInput, required: false }),
        orderBy: t.arg({ type: [Inputs.${rel.targetModel}OrderByWithRelationInput], required: false }),
        limit: t.arg.int({ required: false }),
        offset: t.arg.int({ required: false }),
      },
      query: (args) => ({
        where: args.where ?? undefined,
        orderBy: args.orderBy ?? undefined,
        limit: args.limit ?? undefined,
        offset: args.offset ?? undefined,
      }),
    }),`
  }
  return `${rel.name}: t.relation('${rel.name}'),`
}

export const makeObjectBase = (model: ContractModel, config: ConfigInternal): string => {
  const ids = new Set(identityFieldNames(model))
  const mapId = config.crud.mapIdFieldsToGraphqlId === 'Objects'
  const scalars = model.fields.map((f) => `    ${exposeForScalar(f, mapId, ids.has(f.name))},`).join('\n')
  const relations = model.relations.map((r) => `    ${relationField(r)}`).join('\n')
  const fields = [scalars, relations].filter((part) => part.length > 0).join('\n')

  return useTemplate(
    objectBaseTemplate,
    {
      inputsImporter: config.crud.inputsImporter,
      builderCalculatedImport: getBuilderCalculatedImport({
        config,
        fileLocation: `${config.crud.outputDir}/${model.name}/object.base.ts`,
      }),
      modelName: model.name,
      underscore: getConfigCrudUnderscore(config),
      fields,
    },
    [],
  )
}

const objectBaseTemplate = `#{inputsImporter}#{builderCalculatedImport}
export const #{modelName}#{underscore}Object = builder.prismaObject('#{modelName}', {
  fields: (t) => ({
#{fields}
  }),
});
`

const ormPath = (model: ContractModel, config: ConfigInternal): string =>
  `${config.crud.dbCaller}.orm.${model.namespace}.${model.name}`

const queryArgsTemplate = `{
  where: t.field({ type: Inputs.#{modelName}WhereInput, required: false }),
  orderBy: t.field({ type: [Inputs.#{modelName}OrderByWithRelationInput], required: false }),
  limit: t.field({ type: 'Int', required: false }),
  offset: t.field({ type: 'Int', required: false }),
}`

const uniqueArgsTemplate = `{ where: t.field({ type: Inputs.#{modelName}WhereUniqueInput, required: true }) }`

export interface QueryDef {
  operation: string
  type: string
  nullable: boolean
  args: string
  resolve: string
  isPrisma: boolean
}

export const makeQueries = (model: ContractModel, config: ConfigInternal): QueryDef[] => {
  const orm = ormPath(model, config)
  return [
    {
      operation: 'findMany',
      type: `['${model.name}']`,
      nullable: false,
      args: queryArgsTemplate,
      resolve: `async (_root, args, _context, _info) =>
      ${orm}
        .where(args.where ?? {})
        .orderBy(args.orderBy ?? {})
        .limit(args.limit ?? 100)
        .offset(args.offset ?? 0)`,
      isPrisma: true,
    },
    {
      operation: 'findFirst',
      type: `'${model.name}'`,
      nullable: true,
      args: queryArgsTemplate,
      resolve: `async (_root, args, _context, _info) =>
      ${orm}.where(args.where ?? {}).orderBy(args.orderBy ?? {})`,
      isPrisma: true,
    },
    {
      operation: 'findUnique',
      type: `'${model.name}'`,
      nullable: true,
      args: uniqueArgsTemplate,
      resolve: `async (_root, args, _context, _info) => ${orm}.where(args.where)`,
      isPrisma: true,
    },
    {
      operation: 'count',
      type: `'Int'`,
      nullable: false,
      args: `{ where: t.field({ type: Inputs.#{modelName}WhereInput, required: false }) }`,
      resolve: `async (_root, args, _context, _info) =>
      await ${orm}.where(args.where ?? {}).count()`,
      isPrisma: false,
    },
  ]
}

export interface MutationDef {
  operation: string
  type: string
  nullable: boolean
  args: string
  resolve: string
  isPrisma: boolean
}

export const makeMutations = (model: ContractModel, config: ConfigInternal): MutationDef[] => {
  const orm = ormPath(model, config)
  const uniqueFilter = identityFieldNames(model)
    .map((f) => `${f}: (args.data as any).${f}`)
    .join(', ')
  return [
    {
      operation: 'createOne',
      type: `'${model.name}'`,
      nullable: false,
      args: `{ data: t.field({ type: Inputs.#{modelName}CreateInput, required: true }) }`,
      resolve: `async (_root, args, _context, _info) => {
      const collection = ${orm};
      await collection.create(args.data);
      return collection.where({ ${uniqueFilter} });
    }`,
      isPrisma: true,
    },
    {
      operation: 'createMany',
      type: `['${model.name}']`,
      nullable: false,
      args: `{ data: t.field({ type: [Inputs.#{modelName}CreateInput], required: true }) }`,
      resolve: `async (_root, args, _context, _info) => {
      const collection = ${orm};
      await collection.createAndCount(args.data);
      return collection;
    }`,
      isPrisma: true,
    },
    {
      operation: 'updateOne',
      type: `'${model.name}'`,
      nullable: true,
      args: `{
      where: t.field({ type: Inputs.#{modelName}WhereUniqueInput, required: true }),
      data: t.field({ type: Inputs.#{modelName}UpdateInput, required: true }),
    }`,
      resolve: `async (_root, args, _context, _info) => {
      const collection = ${orm}.where(args.where);
      await collection.update(args.data);
      return collection;
    }`,
      isPrisma: true,
    },
    {
      operation: 'updateMany',
      type: `'BatchPayload'`,
      nullable: false,
      args: `{
      where: t.field({ type: Inputs.#{modelName}WhereInput, required: false }),
      data: t.field({ type: Inputs.#{modelName}UpdateInput, required: true }),
    }`,
      resolve: `async (_root, args, _context, _info) => {
      const count = await ${orm}.where(args.where ?? {}).updateAndCount(args.data);
      return { count };
    }`,
      isPrisma: false,
    },
    {
      operation: 'deleteOne',
      type: `'${model.name}'`,
      nullable: true,
      args: uniqueArgsTemplate,
      resolve: `async (_root, args, _context, _info) => {
      const collection = ${orm}.where(args.where);
      await collection.delete();
      return collection;
    }`,
      isPrisma: true,
    },
    {
      operation: 'deleteMany',
      type: `'BatchPayload'`,
      nullable: false,
      args: `{ where: t.field({ type: Inputs.#{modelName}WhereInput, required: true }) }`,
      resolve: `async (_root, args, _context, _info) => {
      const count = await ${orm}.where(args.where).deleteAndCount();
      return { count };
    }`,
      isPrisma: false,
    },
    {
      operation: 'upsertOne',
      type: `'${model.name}'`,
      nullable: false,
      args: `{
      where: t.field({ type: Inputs.#{modelName}WhereUniqueInput, required: true }),
      create: t.field({ type: Inputs.#{modelName}CreateInput, required: true }),
      update: t.field({ type: Inputs.#{modelName}UpdateInput, required: true }),
    }`,
      resolve: `async (_root, args, _context, _info) => {
      const collection = ${orm}.where(args.where);
      await collection.upsert({ create: args.create, update: args.update });
      return collection;
    }`,
      isPrisma: true,
    },
  ]
}

export const objectsTemplate = `#{contractTypesImporter}#{crudExportRoot}#{builderCalculatedImport}

export const BatchPayload = builder.objectType('BatchPayload', {
  description: 'Batch payloads from prisma.',
  fields: (t) => ({
    count: t.exposeInt('count', { description: 'Prisma Batch Payload', nullable: false }),
  }),
});

export const modelNames = [
  #{modelNames}
] as const;

export type Model = typeof modelNames[number];
`

export const utilsTemplate = `import {
  FieldOptionsFromKind,
  InputFieldMap,
  QueryFieldBuilder,
  MutationFieldBuilder,
  QueryFieldsShape,
  MutationFieldsShape,
  TypeParam,
} from '@pothos/core';#{builderCalculatedImport}

type Types = typeof builder extends PothosSchemaTypes.SchemaBuilder<infer T> ? T : unknown;

export const defineQuery = <Q extends QueryFieldsShape<Types>>(q: Q) => q;

export const defineQueryFunction = <Obj>(
  func: (t: QueryFieldBuilder<Types, Types['Root']>) => Obj,
) => func;

type AnyResolve = (...args: never[]) => unknown;

export const defineQueryObject = <
  Type extends TypeParam<Types>,
  Nullable extends boolean,
  Args extends InputFieldMap,
>(
  obj: Omit<FieldOptionsFromKind<Types, Types['Root'], Type, Nullable, Args, 'Query', Types, unknown>, 'resolve'> & {
    resolve: AnyResolve;
  },
) => obj as { type: Type; nullable: Nullable; args: Args; resolve: AnyResolve };

export const defineQueryPrismaObject = <
  Type extends TypeParam<Types>,
  Nullable extends boolean,
  Args extends InputFieldMap,
>(
  obj: Omit<FieldOptionsFromKind<Types, Types['Root'], Type, Nullable, Args, 'Query', Types, unknown>, 'resolve' | 'type'> & {
    type: Type;
    resolve: AnyResolve;
  },
) => obj as { type: Type; nullable: Nullable; args: Args; resolve: AnyResolve };

export const defineMutation = <M extends MutationFieldsShape<Types>>(m: M) => m;

export const defineMutationFunction = <Obj>(
  func: (t: MutationFieldBuilder<Types, Types['Root']>) => Obj,
) => func;

export const defineMutationObject = <
  Type extends TypeParam<Types>,
  Nullable extends boolean,
  Args extends InputFieldMap,
>(
  obj: Omit<FieldOptionsFromKind<Types, Types['Root'], Type, Nullable, Args, 'Mutation', Types, unknown>, 'resolve'> & {
    resolve: AnyResolve;
  },
) => obj as { type: Type; nullable: Nullable; args: Args; resolve: AnyResolve };

export const defineMutationPrismaObject = <
  Type extends TypeParam<Types>,
  Nullable extends boolean,
  Args extends InputFieldMap,
>(
  obj: Omit<FieldOptionsFromKind<Types, Types['Root'], Type, Nullable, Args, 'Mutation', Types, unknown>, 'resolve' | 'type'> & {
    type: Type;
    resolve: AnyResolve;
  },
) => obj as { type: Type; nullable: Nullable; args: Args; resolve: AnyResolve };
`

export const autoCrudTemplate = `#{imports}#{builderCalculatedImport}
import * as Objects from './objects';

type Model = Objects.Model;

export const Cruds: Record<
  Objects.Model,
  {
    Object: any;
    queries: Record<string, Function>;
    mutations: Record<string, Function>;
  }
> = {
#{modelsGenerated}
};

const crudEntries = Object.entries(Cruds);

type ResolverType = "Query" | "Mutation";
function generateResolversByType(type: ResolverType, opts?: CrudOptions) {
  return crudEntries
    .filter(([modelName]) => includeModel(modelName, opts))
    .map(([modelName, config]) => {
      const resolverEntries = Object.entries(config[type === "Query" ? "queries" : "mutations"]);

      return resolverEntries.map(([operationName, resolverObjectDefiner]) => {
        const resolverName = operationName + modelName;
        const isntPrismaFieldList = ["count", "deleteMany", "updateMany"];
        const isPrismaField = !isntPrismaFieldList.includes(operationName);

        const getFields = (t: any) => {
          const field = resolverObjectDefiner(t);
          const handledField = opts?.handleResolver
            ? opts.handleResolver({
                field,
                modelName: modelName as Model,
                operationName,
                resolverName,
                t,
                isPrismaField,
                type,
              })
            : field;

          return {
            [resolverName]: isPrismaField
              ? t.prismaField(handledField)
              : t.field(handledField),
          }
        }

        return type === "Query"
          ? builder.queryFields((t) => getFields(t))
          : builder.mutationFields((t) => getFields(t));
      });
    });
}

export function generateAllObjects(opts?: CrudOptions) {
  return crudEntries
    .filter(([md]) => includeModel(md, opts))
    .map(([modelName, { Object }]) => {
      return builder.prismaObject(modelName as Model, Object); // Objects is all imports
    });
}

export function generateAllQueries(opts?: CrudOptions) {
  generateResolversByType("Query", opts);
}

export function generateAllMutations(opts?: CrudOptions) {
  generateResolversByType("Mutation", opts);
}

export function generateAllResolvers(opts?: CrudOptions) {
  generateResolversByType("Mutation", opts);
  generateResolversByType("Query", opts);
}

type CrudOptions = {
  include?: Model[];
  exclude?: Model[];
  /**
   * Caution: This is not type safe
   * Wrap all queries/mutations to override args, run extra code in resolve function (ie: throw errors, logs), apply plugins, etc.
   */
  handleResolver?: (props: {
    modelName: Model;
    field: any;
    operationName: string;
    resolverName: string;
    t: any;
    isPrismaField: boolean;
    type: ResolverType;
  }) => any;
};

const includeModel = (model: string, opts?: CrudOptions): boolean => {
  if (!opts) return true;
  if (opts.include) return opts.include.includes(model as Model);
  if (opts.exclude) return !opts.exclude.includes(model as Model);
  return true;
};

export function generateAllCrud(opts?: CrudOptions) {
  generateAllObjects(opts);
  generateAllQueries(opts);
  generateAllMutations(opts);
}
`
