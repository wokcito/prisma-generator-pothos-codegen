import type { PrismaClient } from './generated/prisma'

export type Viewer = { id: number; role: 'member' | 'admin' }

export type Ctx = {
  prisma: PrismaClient
  /** Who is asking. Absent for anonymous requests */
  viewer?: Viewer
}
