import * as Inputs from '@/schema/__generated__/inputs'
import { builder } from '../../../builder';
import { mergeScope, withExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';
import '../../exposure';
import { defineQuery, defineQueryFunction, defineQueryPrismaObject } from '../../utils';

export const findUniquePostQueryArgs = builder.args((t) => ({ where: t.field({ type: Inputs.PostWhereUniqueInput, required: true }) }))

export const findUniquePostQueryObject = defineQueryFunction((t) => {
  const target = { kind: 'query', model: 'Post', operation: 'findUnique', tags: ['canRead'] } as const;

  const operation = defineQueryPrismaObject({
    type: 'Post',
    nullable: true,
    args: findUniquePostQueryArgs,
    resolve: async (query, _root, args, _context, _info) =>
      await _context.prisma.post.findUnique({ where: mergeScope(target, args, _context), ...query }),
  });

  return { ...operation, resolve: withExposure(target, operation.resolve, { flat: false }) };
},
);

export const findUniquePostQuery = defineQuery((t) => ({
  findUniquePost: t.prismaField(findUniquePostQueryObject(t)),
}));
