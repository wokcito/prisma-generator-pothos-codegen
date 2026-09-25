import * as Inputs from '@/schema/__generated__/inputs'
import { builder } from '../../../builder';
import { clampTake, mergeScope, withExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';
import '../../exposure';
import { defineQuery, defineQueryFunction, defineQueryPrismaObject } from '../../utils';

export const findManyPostQueryArgs = builder.args((t) => ({
  where: t.field({ type: Inputs.PostWhereInput, required: false }),
  orderBy: t.field({ type: [Inputs.PostOrderByWithRelationInput], required: false }),
  cursor: t.field({ type: Inputs.PostWhereUniqueInput, required: false }),
  take: t.field({ type: 'Int', required: false }),
  skip: t.field({ type: 'Int', required: false }),
  distinct: t.field({ type: [Inputs.PostScalarFieldEnum], required: false }),
}))

export const findManyPostQueryObject = defineQueryFunction((t) => {
  const target = { kind: 'query', model: 'Post', operation: 'findMany', tags: ['canRead'] } as const;

  const operation = defineQueryPrismaObject({
    type: ['Post'],
    nullable: false,
    args: findManyPostQueryArgs,
    resolve: async (query, _root, args, _context, _info) =>
      await _context.prisma.post.findMany({
        where: mergeScope(target, args, _context),
        cursor: args.cursor || undefined,
        take: clampTake(args.take, 50),
        distinct: args.distinct || undefined,
        skip: args.skip || undefined,
        orderBy: args.orderBy || undefined,
        ...query,
      }),
  });

  return { ...operation, resolve: withExposure(target, operation.resolve, { flat: false }) };
},
);

export const findManyPostQuery = defineQuery((t) => ({
  findManyPost: t.prismaField(findManyPostQueryObject(t)),
}));
