/**
 * The rules of this application, with plain functions: the generator and the runtime know nothing about them. They are
 * connected to the generated schema with `configureExposure` (tags -> guards, and what rows and fields each role sees).
 */
import { byTag, configureExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime'
import type { Ctx } from './context'
import './schema/__generated__/exposure' // registers the manifest

const readable = { anonymous: ['Post'], member: ['Post', 'User'], admin: ['Post', 'User'] } as const
type Role = keyof typeof readable

const roleOf = (ctx: Ctx): Role => ctx.viewer?.role ?? 'anonymous'
const forbidden = (code: string) => Object.assign(new Error(code), { code })

export const setupSecurity = () =>
  configureExposure({
    // What each tag of `crud.exposure.operations` means
    guards: byTag({
      loggedIn: () => (_root, _args, ctx: Ctx) => {
        if (!ctx.viewer) throw forbidden('UNAUTHENTICATED')
      },
      canRead: (t) => (_root, _args, ctx: Ctx) => {
        if (!(readable[roleOf(ctx)] as readonly string[]).includes(t.model)) throw forbidden('FORBIDDEN')
      },
    }),
    // Which rows each role sees, in operations and in relations
    scope: (t, ctx: Ctx) => {
      const model = t.kind === 'relation' ? t.targetModel : t.model
      if (model !== 'Post') return roleOf(ctx) === 'anonymous' && model === 'User' ? { OR: [] } : undefined
      if (roleOf(ctx) === 'admin') return undefined
      return roleOf(ctx) === 'member' ? { OR: [{ published: true }, { authorId: ctx.viewer?.id }] } : { published: true }
    },
    // Which `guarded` fields of a loaded row can be read
    fieldAccess: (_t, parent, ctx: Ctx) => roleOf(ctx) === 'admin' || parent.id === ctx.viewer?.id,
    // The same rule as a where, for when a client filters by them
    fieldScope: (_t, ctx: Ctx) => (roleOf(ctx) === 'admin' ? undefined : { id: ctx.viewer?.id ?? -1 }),
  })
