import * as Inputs from '@/schema/__generated__/inputs'
import { builder } from '../../../builder';
import { clampTake, mergeScope, withExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';
import '../../exposure';
import { defineQuery, defineQueryFunction, defineQueryPrismaObject } from '../../utils';

export const findManyUserQueryArgs = builder.args((t) => ({
  where: t.field({ type: Inputs.UserWhereInput, required: false }),
  orderBy: t.field({ type: [Inputs.UserOrderByWithRelationInput], required: false }),
  cursor: t.field({ type: Inputs.UserWhereUniqueInput, required: false }),
  take: t.field({ type: 'Int', required: false }),
  skip: t.field({ type: 'Int', required: false }),
  distinct: t.field({ type: [Inputs.UserScalarFieldEnum], required: false }),
}))

export const findManyUserQueryObject = defineQueryFunction((t) => {
  const target = { kind: 'query', model: 'User', operation: 'findMany', tags: ['loggedIn', 'canRead'] } as const;

  const operation = defineQueryPrismaObject({
    type: ['User'],
    nullable: false,
    args: findManyUserQueryArgs,
    resolve: async (query, _root, args, _context, _info) =>
      await _context.prisma.user.findMany({
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

export const findManyUserQuery = defineQuery((t) => ({
  findManyUser: t.prismaField(findManyUserQueryObject(t)),
}));
