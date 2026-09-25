import * as Inputs from '@/schema/__generated__/inputs'
import { builder } from '../../../builder';
import { mergeScope, withExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';
import '../../exposure';
import { defineQuery, defineQueryFunction, defineQueryPrismaObject } from '../../utils';

export const findUniqueUserQueryArgs = builder.args((t) => ({ where: t.field({ type: Inputs.UserWhereUniqueInput, required: true }) }))

export const findUniqueUserQueryObject = defineQueryFunction((t) => {
  const target = { kind: 'query', model: 'User', operation: 'findUnique', tags: ['loggedIn', 'canRead'] } as const;

  const operation = defineQueryPrismaObject({
    type: 'User',
    nullable: true,
    args: findUniqueUserQueryArgs,
    resolve: async (query, _root, args, _context, _info) =>
      await _context.prisma.user.findUnique({ where: mergeScope(target, args, _context), ...query }),
  });

  return { ...operation, resolve: withExposure(target, operation.resolve, { flat: false }) };
},
);

export const findUniqueUserQuery = defineQuery((t) => ({
  findUniqueUser: t.prismaField(findUniqueUserQueryObject(t)),
}));
