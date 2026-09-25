import { Prisma } from '@/generated/prisma';
import { builder } from '../builder';
import './exposure';

export const BatchPayload = builder.objectType(builder.objectRef<Prisma.BatchPayload>('BatchPayload'), {
  description: 'Batch payloads from prisma.',
  fields: (t) => ({
    count: t.exposeInt('count', { description: 'Prisma Batch Payload', nullable: false }),
  }),
});

export const modelNames = [
  'User',
  'Post',
] as const;

export type Model = typeof modelNames[number];
