import * as Inputs from '@/schema/__generated__/inputs'
import { builder } from '../../builder';
import { canReadField, clampTake, mergeScope } from '@wokcito/prisma-generator-pothos-codegen/runtime';
import '../exposure';
import {
  definePrismaObject,
  defineFieldObject,
  defineRelationFunction,
  defineRelationObject,
} from '../utils';

export const UserObject = definePrismaObject('User', {
  description: undefined,
  findUnique: ({ id }) => ({ id }),
  fields: (t) => ({
    id: t.field(UserIdFieldObject),
    email: t.field(UserEmailFieldObject),
    phone: t.field(UserPhoneFieldObject),
    role: t.field(UserRoleFieldObject),
    createdAt: t.field(UserCreatedAtFieldObject),
    posts: t.relation('posts', UserPostsFieldObject(t)),
  }),
});

export const UserIdFieldObject = defineFieldObject('User', {
  type: "ID",
  description: undefined,
  nullable: false,
  resolve: (parent) => String(parent.id),
});

export const UserEmailFieldObject = defineFieldObject('User', {
  type: "String",
  description: undefined,
  nullable: true,
  resolve: (parent, _args, ctx) => (canReadField({ model: 'User', field: 'email' }, parent, ctx) ? parent.email : null),
});

export const UserPhoneFieldObject = defineFieldObject('User', {
  type: "String",
  description: undefined,
  nullable: true,
  resolve: (parent, _args, ctx) => (canReadField({ model: 'User', field: 'phone' }, parent, ctx) ? parent.phone : null),
});

export const UserRoleFieldObject = defineFieldObject('User', {
  type: "String",
  description: undefined,
  nullable: false,
  resolve: (parent) => parent.role,
});

export const UserCreatedAtFieldObject = defineFieldObject('User', {
  type: Inputs.DateTime,
  description: undefined,
  nullable: false,
  resolve: (parent) => parent.createdAt,
});

const UserPostsFieldObjectTarget = { kind: 'relation', model: 'User', field: 'posts', targetModel: 'Post', isList: true } as const;

export const UserPostsFieldArgs = builder.args((t) => ({
  where: t.field({ type: Inputs.PostWhereInput, required: false }),
  orderBy: t.field({ type: [Inputs.PostOrderByWithRelationInput], required: false }),
  cursor: t.field({ type: Inputs.PostWhereUniqueInput, required: false }),
  take: t.field({ type: 'Int', required: false }),
  skip: t.field({ type: 'Int', required: false }),
  distinct: t.field({ type: [Inputs.PostScalarFieldEnum], required: false }),
}))

export const UserPostsFieldObject = defineRelationFunction('User', (t) =>
  defineRelationObject('User', 'posts', {
    description: undefined,
    nullable: false,
    args: UserPostsFieldArgs,
    query: (args, ctx) => ({
      where: mergeScope(UserPostsFieldObjectTarget, args, ctx),
      cursor: args.cursor || undefined,
      take: clampTake(args.take, 50),
      distinct: args.distinct || undefined,
      skip: args.skip || undefined,
      orderBy: args.orderBy || undefined,
    }),
  }),
);
