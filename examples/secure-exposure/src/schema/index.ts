import { setupSecurity } from '../security'
import { generateAllCrud } from './__generated__/autocrud'
import { builder } from './builder'

// Fails at startup (not at the first request) with a tag without guard, a guarded field without fieldAccess, etc.
setupSecurity()

generateAllCrud()

builder.queryType({})

export const schema = builder.toSchema({})
