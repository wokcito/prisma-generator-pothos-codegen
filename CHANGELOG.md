# Changelog

## 1.1.0

### Minor Changes

- Validate the configuration at generation time: all the errors are reported together, with the path and the valid values, and unknown keys get a "did you mean" suggestion.
- Add `crud.exposure.models.<Model>.fields`, with the states `hidden`, `guarded`, `readonly` and `unfilterable` (a state or an array of states).
  
  - `hidden` removes a field from the object and from every input and enum, including the nested `XCreateWithoutYInput`/`XUpdateWithoutYInput`, and drops compound uniques that contain it.
  - `readonly` on a relation also closes its foreign keys in the write inputs (no mass assignment through `authorId`).
  - `guarded` scalars are nullable and ask the runtime; `guarded` to-one relations are nullable and `null` when the target row is not readable.
- With `crud.exposure`, the generator also writes `exposure.ts` (registers the manifest), `exposure.types.ts` (`ExposureConfig` with your models and fields) and `exposure.manifest.json` (deterministic), and prints the models that use the default exposure. Inputs are pruned to what the enabled operations and the objects reach (`exposure.keepInputs` keeps others for your own resolvers), and scalars and `NEVER` are recalculated over what is emitted.
- Add `crud.exposure.maxTake` (global) and `models.<Model>.maxTake` to cap `take` in `findMany` and list relations, with `clampTake` (keeps the sign).
- Secure exposure notes. An earlier draft (`exposure.neverExposed`, `relations`, `allowToOne`, `restricted`, `hooks`, `maxTake`) was never published; it was replaced by the API above and a runtime. Without `crud.exposure` the generated code is byte-identical to 1.0.0 (covered by golden files generated with 1.0.0).
  
  Requirements: the runtime and the emitted code need `lib` ES2019 (`Array.prototype.flat`); the emitted code compiles with TypeScript 5.4.
  
  Behaviors worth knowing (found by testing against Prisma 7, see `spikes.md`):
  
  - `{ OR: [] }` as an element of an `AND` is ignored by Prisma (it does not mean "no rows" there), so the runtime never emits it: it replaces it with a condition on a real column that is false everywhere.
  - Prisma does not accept a `where` on a to-one relation: a `guarded` to-one relation is loaded with its parent and checked afterwards, one query per level.
  
  Known limitations:
  
  - `createOne`/`createMany` can not impose values from the context (write them by hand); `upsertOne` can not be scoped by row.
  - A guarded to-one relation needs the target to have a single-field `@id`, and costs one extra query per level.
  - Replacing `resolve` of a generated operation drops the wrapper (guards and scope): call `withExposure` again.
- Add `crud.exposure.operations` (global) and `models.<Model>.operations` (override, or `inherit: true`): which operations exist, each with optional tags that the application resolves at runtime. Only what is listed is generated: with `operations`, a model not in `models` has no operations, and a model with no operations that no visible relation reaches is not generated at all.
  
  `excludeResolvers*`/`includeResolvers*` are **deprecated** in favor of `operations` (using both is an error; without `operations` they work as before) and will be removed in a future major version.
- Add the `@wokcito/prisma-generator-pothos-codegen/runtime` entry point (no dependencies): `configureExposure`, `byTag`, `withExposure`, `mergeScope`, `clampTake`, `canReadField`, `isRowReadable` and `assertExposureConfigured`, with the hooks `guards`, `scope`, `fieldAccess` and `fieldScope`. The generated code never names an authorization library.
  
  `mergeScope` rewrites the client `where` so a row that scope hides behaves as if it did not exist (`some`/`none`/`every`/`is`/`isNot`, nested, inside `AND`/`OR`/`NOT`), adds the `fieldScope` of guarded fields used in `where`, `orderBy`, `cursor` and `distinct`, and rejects ordering through a restricted relation.

### Patch Changes

- Docs: "Secure exposure" in the README, the runtime contract, the migration from the pre-release API and `spikes.md`. `examples/secure-exposure` runs against a real sqlite database.
- Fix: keys that do not exist in `exposure` were ignored.
- Fix (**behavior change**): a config file written as `module.exports = { crud: { ... } }` was silently ignored when the generator ran through Node's ESM loader (`tsx`), because the keys were only read from named exports. They are now also read from the `default` export, so a configuration that used to be ignored is now applied. Configs loaded as compiled CommonJS (the published package) were not affected.
- Fix: the config file was not loaded on Windows, because `import()` needs a file URL for an absolute path.
- Fix: `maxTake` made `findFirst` fail (Prisma only accepts `take` 1 or -1 there) and a negative `take` skipped the cap.
- Fix: hiding the only editable column of a model left `NEVER` used but not defined, so `builder.toSchema()` failed with `NEVER is not defined`.
- Fix: `useTemplate` inserts values literally, so generated code containing `$&`, `$'` or `$$` is no longer mangled.
- Migrate the development toolchain: Bun replaces Yarn, Vitest replaces Jest and ts-jest, TypeScript 7 replaces 5.9, tsx replaces ts-node and Biome replaces ESLint and Prettier. `tsconfig.build.json` is now used to build `dist`, and tests are type checked. This does not change the generated code or the published API.
- Update dependencies to their latest versions and pin them to exact versions.

## 1.0.0

### Major Changes

- Support Prisma ORM 7 (tested against 7.10.0) and publish the package as `@wokcito/prisma-generator-pothos-codegen`.
  
  - **Breaking:** `prisma` and `@prisma/client` peer dependencies now require `^7.10.0`, `@pothos/core` `^4.15.1` and `@pothos/plugin-prisma` `^4.17.0`. Node.js `>=20.19.0` is required.
  - The generated `Bytes` scalar's `Input` mapping now accepts `Uint8Array` (Prisma 6+ represents `Bytes` fields as `Uint8Array` instead of `Buffer`).
  - `dmmf.schema.inputObjectTypes.prisma` is optional in Prisma 7's DMMF types and is handled with a fallback.
  - Docs: the SQLite example and the README setup now use a driver adapter (`@prisma/adapter-better-sqlite3`) and `prisma.config.ts`, and the generator no longer writes to `node_modules` by default. Recent `@pothos/plugin-prisma` versions need `dmmf: getDatamodel()` (not `Prisma.dmmf`), which requires the `pothos` generator's `output` to be a `.ts` file with `generateDatamodel = "true"`.

### Patch Changes

- Chore: bump the development dependencies to their latest stable versions (ESLint 10, TypeScript-ESLint 8, Jest 30, ts-jest 29, Prettier 3.9, etc.). TypeScript stays on `5.9.3`, because TypeScript 7 was not yet supported by `ts-jest` and `typescript-eslint`. `.eslintrc` was migrated to a flat config (`eslint.config.js`) since ESLint 9+ dropped `.eslintrc`, and the `ts-jest` config moved from the deprecated `globals` key to `transform`.

## 0.7.1

- [x] Chore: Update pothos packages of peerDependencies to v4

## 0.7.0

- [x] Upgrade: Support to new versions of Pothos and Pothos Prisma Plugin (v4+) Thanks to [hayes](https://github.com/Cauen/prisma-generator-pothos-codegen/pull/71)
- [x] Chore: Update prisma to latest version 5.17.0

## 0.6.5

- [x] Fix: Enables multiline comments and quotes in comments. It fixes: #69 and fixes #70.
- [x] Chore: Update prisma to latest version 5.15.1
- [x] Chore: remove global.builderImporter config from types and docs due to global.builderLocation. Fixes #68

## 0.6.4

- [x] Feature: From now: new generations uses new version of @pothos/core to disable input normalization: https://github.com/hayes/pothos/issues/1111. It fixes: #57.
- [x] Chore/Example-Update: Update Pothos/Prisma/Others to latest versions
- [x] Chore/Peer-deps: Remove @pothos/core exact version restriction
- [x] Chore/Deps: Removing useless deps

## 0.6.3

- [x] Upgrade: Update prisma to latest version
 - Remove distinct from count https://github.com/prisma/prisma/issues/4228
- [x] Improve: Remove tokenizr dep
 - Add tests for comments parser
- [x] Upgrade: Update dependancies and peerDependancies
- [x] Improve: Update prettier and eslint (to remove some conflicts)
- [x] Chore: Eslint remove semicolon
- [x] Feature: New option `config.crud.underscoreBetweenObjectVariableNames` change the generated variables from object.base.ts from something like `UserName` to `User_Name`. This avoids generated duplicated names in some cases. Fixes #58

## 0.6.2

- [x] Fix: The builder path is incorrect in Windows #55

## 0.6.1

- [x] Upgrade: Expand supports to new Prisma Version 5.1.1. Fixes #53
 -Ignore fieldRefTypes at "generate inputs" to enable support of new prisma version

## 0.6.0

- [x] Fix: Fix Typescript errors for non Pothos exposable fields ('String', 'Int', 'Float', 'Boolean'), like "BigInt" used as @id. Fixes: #45
 - Replace exposes in generated object.base files with unified t.field
- [x] Feature(Breaking Change): It is no longer necessary to define multiple "builderImporter". Now define in config.global.builderLocation the location of the builder, and all imports will be defined automatically. 
- [x] Feature: Break args apart to make code spliting better. Fixes #49

## 0.5.9

- [x] Improve: Add config config.crud.mapIdFieldsToGraphqlId to allow disable Objects ID fields from being parsed to Graphql ID scalar.
- [x] Improve: Add config config.inputs.mapIdFieldsToGraphqlId to allow parsing WhereUniqueInput ID fields to Graphql ID scalar.

## 0.5.8

- [x] Improve: Input scalar some improves at parseValue
- [x] Docs: Some docs improves based on #45

## 0.5.7

- [x] Fix: correctly priorize list on inputs (generated again, code changes serves as an example)

## 0.5.6

- [x] Fix: autocrud generating buggy updateMany mutations #37

## 0.5.5

- [x] Added: Add simple mode to input generator #30
- [x] Changed: Add modify permission step after build #34

## 0.5.4

- [x] Changed: Objects now exports everything from CRUD, optionally disable on crud options.

## 0.5.3

- [x] Changed: Augment/derive generated input types

## 0.5.2

- [x] Changed: Fixed autocrud generating buggy deleteOne mutations #24

## 0.5.1

- [x] Added: Global handle resolvers generated by crud. Wrap all queries/mutations to override args, run extra code in resolve function (ie: throw errors, logs), apply plugins, etc. #17 #18

## 0.5.0

- [x] Added: Delete Output Dir Before Generate option to crud
- [x] Added: Before/After option to global. Handle DMMF before and after generation.
- [x] Changed: (Crud) possibility to exclude some files from generation #14
- [x] Changed: (Autocrud) now can only run generated files (before can run not generated files)
- [x] Changed: (Autocrud) now works by running only generated files (i.e. files excluded from generation don't need to be excluded from autocrud)
- [x] Changed: (Crud) Named exports in all indexes (Support for Nextjs) #15
- [x] Changed: (Crud) objects.ts no longer exports everything from within models. This will avoid growing the object file too much when changing to export variables named in model indexes.
- [x] Changed: Support newer version of @pothos/plugin-prisma and add disclaimer. Thanks to [saphewilliam](https://github.com/Cauen/prisma-generator-pothos-codegen/pull/13)

## 0.4.5

- [x] Changed: Object field scalar array as pothos array #12
- [x] Changed: Distinct at queries is always uppercase #11

## 0.4.4

- [x] Changed: Now writing files is asynchronous

## 0.4.3

- [x] Changed: Now TS compiler uses `"newLine": "lf"`
