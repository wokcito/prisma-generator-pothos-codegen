import * as Inputs from '@/schema/__generated__/inputs'
import { builder } from '../../../builder';
import { mergeScope, withExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';
import '../../exposure';
import { defineQuery, defineQueryFunction, defineQueryObject } from '../../utils';

export const countPostQueryArgs = builder.args((t) => ({
  where: t.field({ type: Inputs.PostWhereInput, required: false }),
  orderBy: t.field({ type: [Inputs.PostOrderByWithRelationInput], required: false }),
  cursor: t.field({ type: Inputs.PostWhereUniqueInput, required: false }),
  take: t.field({ type: 'Int', required: false }),
  skip: t.field({ type: 'Int', required: false }),
  distinct: t.field({ type: [Inputs.PostScalarFieldEnum], required: false }),
}))

export const countPostQueryObject = defineQueryFunction((t) => {
  const target = { kind: 'query', model: 'Post', operation: 'count', tags: ['canRead'] } as const;

  const operation = defineQueryObject({
    type: 'Int',
    nullable: false,
    args: countPostQueryArgs,
    resolve: async (_root, args, _context, _info) =>
      await _context.prisma.post.count({
        where: mergeScope(target, args, _context),
        cursor: args.cursor || undefined,
        take: args.take || undefined,
        skip: args.skip || undefined,
        orderBy: args.orderBy || undefined,
      }),
  });

  return { ...operation, resolve: withExposure(target, operation.resolve, { flat: true }) };
},
);

export const countPostQuery = defineQuery((t) => ({
  countPost: t.field(countPostQueryObject(t)),
}));
