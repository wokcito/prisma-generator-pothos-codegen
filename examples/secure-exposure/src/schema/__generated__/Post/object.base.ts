import * as Inputs from '@/schema/__generated__/inputs'
import { builder } from '../../builder';
import { isRowReadable } from '@wokcito/prisma-generator-pothos-codegen/runtime';
import '../exposure';
import {
  definePrismaObject,
  defineFieldObject,
  defineRelationFunction,
  defineRelationObject,
  defineGuardedRelationObject,
} from '../utils';

export const PostObject = definePrismaObject('Post', {
  description: undefined,
  findUnique: ({ id }) => ({ id }),
  fields: (t) => ({
    id: t.field(PostIdFieldObject),
    title: t.field(PostTitleFieldObject),
    published: t.field(PostPublishedFieldObject),
    createdAt: t.field(PostCreatedAtFieldObject),
    author: PostAuthorFieldObject(t),
    authorId: t.field(PostAuthorIdFieldObject),
  }),
});

export const PostIdFieldObject = defineFieldObject('Post', {
  type: "ID",
  description: undefined,
  nullable: false,
  resolve: (parent) => String(parent.id),
});

export const PostTitleFieldObject = defineFieldObject('Post', {
  type: "String",
  description: undefined,
  nullable: false,
  resolve: (parent) => parent.title,
});

export const PostPublishedFieldObject = defineFieldObject('Post', {
  type: "Boolean",
  description: undefined,
  nullable: false,
  resolve: (parent) => parent.published,
});

export const PostCreatedAtFieldObject = defineFieldObject('Post', {
  type: Inputs.DateTime,
  description: undefined,
  nullable: false,
  resolve: (parent) => parent.createdAt,
});

export const PostAuthorFieldObject = defineGuardedRelationObject('Post', 'author', 'User', {
  description: undefined,
  isReadable: (row, _context) =>
    isRowReadable(
      { kind: 'relation', model: 'Post', field: 'author', targetModel: 'User', isList: false },
      row,
      _context,
      { key: 'id', find: (where) => _context.prisma.user.findMany({ where, select: { id: true } }) },
    ),
});

export const PostAuthorIdFieldObject = defineFieldObject('Post', {
  type: "Int",
  description: undefined,
  nullable: false,
  resolve: (parent) => parent.authorId,
});
