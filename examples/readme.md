# Running examples

## With source code

- Clone this repo
- `cd examples/inputs-simple-sqlite`
- `yarn install`
- `yarn migrate`
- `yarn dev`

## Without

- Clone this repo
- `cd examples/inputs-simple-sqlite`
- `yarn install`
- `yarn add prisma-generator-pothos-codegen`
- Replace generator from `/prisma/schema.prisma` from `ts-node --transpile-only ../../src/generator.ts` to `prisma-generator-pothos-codegen`
- `yarn migrate`
- `yarn dev`
# Secure exposure example

`secure-exposure` is the scenario of the "Secure exposure" section of the main README: `User`, `Post`, `Comment`, `AuthToken` and `AuditLog` with hidden, guarded, readonly and unfilterable fields, tagged operations, `maxTake` and a guarded to-one relation (`Post.author`). It uses `@wokcito/prisma-generator-pothos-codegen/runtime` and nothing else for authorization: the rules of the application are plain functions in `src/security.ts`.

- `src/schema/configs.js`: the `crud.exposure` config.
- `src/security.ts`: `configureExposure` with the guards (`byTag`), `scope`, `fieldAccess` and `fieldScope`.
- Tests, all against a **real, temporary sqlite database** created with `prisma db push` and the real Pothos schema:
  - `sqlite.test.ts`: the table of expected results for an anonymous viewer, a member and an admin.
  - `limits.test.ts`: `maxTake` in root queries and list relations.
  - `guarded-relations.test.ts`: guarded to-one relations, and the number of queries (spike 1).
  - `filters.test.ts`: how `mergeScope` rewrites filters, and scoped writes (spikes 2 and 3).
  - `schema.test.ts`: the printed schema, pruned inputs, startup failures and that the manifest matches the config.

- `cd examples/secure-exposure`
- `bun install`
- `bun run generate` (builds the generator, links its `dist` as `@wokcito/prisma-generator-pothos-codegen` (the runtime is its `/runtime` subpath), then `prisma generate`)
- `bun run tscheck`
- `bun run test`
- `bun run tscheck:compat` and `bun run tscheck:ts54`: the generated code compiles with looser options and with TypeScript 5.4
