import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma';

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });

export const db = new PrismaClient({
  adapter,
  // log: ['error', 'info', 'query', 'warn'],
});
