# Prisma Generator Pothos Codegen

![Group 1](https://github.com/wokcito/prisma-generator-pothos-codegen/assets/8796757/19f6cdbe-44f5-40ac-8b9b-326c49c1c281)

A [prisma](https://www.prisma.io/) [generator](https://www.prisma.io/docs/concepts/components/prisma-schema/generators) plugin that auto-generates [Pothos](https://pothos-graphql.dev/) GraphQL input types and crud operations (all queries and mutations).

Easily convert a prisma schema into a full graphql CRUD API.

On `prisma generate` we create:

- All [input types](https://pothos-graphql.dev/docs/guide/inputs) for `Create`, `Find`, `Update`, `Sort` and `Delete` operations (to be used as args in [fields](https://pothos-graphql.dev/docs/guide/fields#arguments)).
- (Optional): Create all `Objects`, `Queries` and `Mutations` base files (to create customizable resolvers).
- (Optional): Execute all these base files without customization to create a default CRUD.

## Table of Contents

<!-- toc -->

- [Getting Started](#getting-started)
  * [Install](#install)
  * [Peer dependencies](#peer-dependencies)
  * [Set Up](#set-up)
    + [Add the generator to your schema.prisma](#add-the-generator-to-your-schemaprisma)
    + [Add scalar types to the builder](#add-scalar-types-to-the-builder)
    + [Create a configuration file (optional)](#create-a-configuration-file--optional-)
    + [Run the generator](#run-the-generator)
- [Usage](#usage)
  * [Inputs](#inputs)
  * [Objects](#objects)
  * [Queries and Mutations](#queries-and-mutations)
  * [Auto define all `objects`, `queries` and `mutations` (crud operations)](#auto-define-all--objects----queries--and--mutations---crud-operations-)
  * [Examples](#examples)
- [Secure exposure](#secure-exposure)
  * [What you need to know](#what-you-need-to-know)
  * [Field states](#field-states-modelsmodelfields)
  * [Operations and tags](#operations-and-tags-operations)
  * [`maxTake`](#maxtake)
  * [Validation](#validation)
  * [Generated files](#generated-files)
  * [The runtime](#the-runtime)
  * [Inputs are pruned](#inputs-are-pruned)
  * [What changes for the clients of your API](#what-changes-for-the-clients-of-your-api)
  * [Limitations](#limitations)
  * [Migrating from the pre-release API](#migrating-from-the-pre-release-api)
  * [Naming variants](#naming-variants)
- [Disclosures](#disclosures)
  * [Models with only relations](#models-with-only-relations)
  * [`inputs.ts` is not type checked](#inputsts-is-not-type-checked)
  * [BigInt rename](#bigint-rename)

<!-- tocstop -->

## Getting Started

### Install

Using yarn

```sh
yarn add -D @wokcito/prisma-generator-pothos-codegen
```

or using npm

```sh
npm install --save-dev @wokcito/prisma-generator-pothos-codegen
```

### Peer dependencies

The package has been developed and tested up to the following peer dependencies (see updated [example](/examples/inputs-simple-sqlite)):

<!-- TODO Maybe we could have some sort of automated pipeline that tests different versions of these peer deps? -->

```
"@pothos/core": "^4.0.2",
"@pothos/plugin-prisma": "^4.0.3"",
"@prisma/client": "^7.10.0",
"prisma": "^7.10.0",
```

Using higher versions may break something. In these cases, please open a new issue.

### Set Up

#### Add the generator to your schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
  // Optional. If you set a custom `output` here (recommended since Prisma 7, as the new
  // "prisma-client" provider requires it), also set a matching `clientOutput` on the `pothos`
  // generator below. See the updated example for a full working setup with a custom output.
}

generator pothos {
  provider = "prisma-pothos-types"
  // Recent @pothos/plugin-prisma versions need the full datamodel (with unique indexes, etc.) at
  // runtime, which Prisma 7's client no longer embeds. `generateDatamodel` emits a `getDatamodel()`
  // function you must pass to the builder (see below) — but its implementation is only emitted
  // when `output` is a plain `.ts` file (not `.d.ts`), so use a `.ts` extension here.
  output            = "./pothos-types.ts"
  generateDatamodel = "true"
}

generator pothosCrud {
  provider = "prisma-generator-pothos-codegen"
  generatorConfigPath = "./pothos.config.js"
  // You may also set the `generatorConfigPath` via the `POTHOS_CRUD_CONFIG_PATH` environment variable.
  // The environment variable will override the path hardcoded here.
}

/// This is a user!
model User {
  /// This is an id!
  id  String  @id
}
```

#### Add scalar types to the builder

```ts
import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import { Scalars } from '@wokcito/prisma-generator-pothos-codegen';
// Import from your Prisma Client `output` path (the `.prisma/client` default location is no
// longer generated since Prisma 7 when a custom `output` is set).
import { Prisma } from './generated/prisma';
import { db } from './db';
import PrismaTypes, { getDatamodel } from './pothos-types';

export const builder = new SchemaBuilder<{
  // ... Context ...
  PrismaTypes: PrismaTypes; // required for @pothos/plugin-prisma integration (which is required)
  Scalars: Scalars<Prisma.Decimal, Prisma.InputJsonValue | null, Prisma.InputJsonValue>; // required to define correct types for created scalars.
}>({
  plugins: [PrismaPlugin],
  prisma: {
    client: db,
    // Required by recent @pothos/plugin-prisma versions (see `generateDatamodel` above) —
    // do NOT use `Prisma.dmmf`, it's missing fields (like unique indexes) since Prisma 7.
    dmmf: getDatamodel(),
  },
});
```

#### Create a configuration file (optional)

```js
// ./pothos.config.js

/** @type {import('@wokcito/prisma-generator-pothos-codegen').Config} */
module.exports = {
  inputs: {
    outputFilePath: './src/graphql/__generated__/inputs.ts',
  },
  crud: {
    outputDir: './src/graphql/__generated__/',
    inputsImporter: `import * as Inputs from '@graphql/__generated__/inputs';`,
    resolverImports: `import prisma from '@lib/prisma';`,
    prismaCaller: 'prisma',
  },
  global: {
  },
};
```

<details>
  <summary>Click to see all configuration options</summary>

  ```ts
  {
    /** Input type generation config */
    inputs?: {
      /** Create simpler inputs for easier customization and ~65% less generated code. Default: `false` */
      simple?: boolean;
      /** How to import the Prisma namespace. Default: `"import { Prisma } from '.prisma/client';"` */
      prismaImporter?: string;
      /** Path to generate the inputs file to from project root. Default: `'./generated/inputs.ts'` */
      outputFilePath?: string;
      /** List of excluded scalars from generated output */
      excludeScalars?: string[];
      /** A function to replace generated source. Combined with global replacer config */
      replacer?: Replacer<'inputs'>;
      /** Map all Prisma fields with "@id" attribute to Graphql "ID" Scalar.
       *
       * ATTENTION: Mapping non String requires a conversion inside resolver, once GraphQl ID Input are coerced to String by definition. Default: false */
      mapIdFieldsToGraphqlId?: false | 'WhereUniqueInputs';
    };
    /** CRUD generation config */
    crud?: {
      /** Disable generaton of crud. Default: `false` */
      disabled?: boolean;
      /** How to import the inputs. Default `"import * as Inputs from '../inputs';"` */
      inputsImporter?: string;
      /** How to import the Prisma namespace at the objects.ts file. Default `"import { Prisma } from '.prisma/client';"`. Please use "resolverImports" to import prismaClient at resolvers. */
      prismaImporter?: string;
      /** How to call the prisma client. Default `'_context.prisma'` */
      prismaCaller?: string;
      /** Any additional imports you might want to add to the resolvers (e.g. your prisma client). Default: `''` */
      resolverImports?: string;
      /** Directory to generate crud code into from project root. Default: `'./generated'` */
      outputDir?: string;
      /** A function to replace generated source. Combined with global replacer config */
      replacer?: Replacer<'crud'>;
      /** A boolean to enable/disable generation of `autocrud.ts` which can be imported in schema root to auto generate all crud objects, queries and mutations. Default: `true` */
      generateAutocrud?: boolean;
      /**
       * An array of parts of resolver names to be excluded from generation. Ie: ["User"] Default: []
       * @deprecated Use `crud.exposure.operations` (and `models`), which decides the operations of each model. Still works when `exposure.operations` is not used; using both is an error.
       */
      excludeResolversContain?: string[];
      /**
       * An array of resolver names to be excluded from generation. Ie: ["upsertOneComment"] Default: []
       * @deprecated Use `crud.exposure.operations` (and `models`), which decides the operations of each model. Still works when `exposure.operations` is not used; using both is an error.
       */
      excludeResolversExact?: string[];
      /**
       * An array of parts of resolver names to be included from generation (to bypass exclude contain). Ie: if exclude ["User"], include ["UserReputation"] Default: []
       * @deprecated Use `crud.exposure.operations` (and `models`), which decides the operations of each model. Still works when `exposure.operations` is not used; using both is an error.
       */
      includeResolversContain?: string[];
      /**
       * An array of resolver names to be included from generation (to bypass exclude contain). Ie: if exclude ["User"], include ["UserReputation"] Default: []
       * @deprecated Use `crud.exposure.operations` (and `models`), which decides the operations of each model. Still works when `exposure.operations` is not used; using both is an error.
       */
      includeResolversExact?: string[];
      /** Caution: This delete the whole folder (Only use if the folder only has auto generated contents). A boolean to delete output dir before generate. Default: False */
      deleteOutputDirBeforeGenerate?: boolean;
      /** Export all crud queries/mutations/objects in objects.ts at root dir. Default: true */
      exportEverythingInObjectsDotTs?: boolean;
      /** Map all Prisma fields with "@id" attribute to Graphql "ID" Scalar. Default: 'Objects' */
      mapIdFieldsToGraphqlId?: false | 'Objects';
      /** Change the generated variables from object.base.ts from something like `UserName` to `User_Name`. This avoids generated duplicated names in some cases. See [issue #58](https://github.com/wokcito/prisma-generator-pothos-codegen/issues/58). Default: false */
      underscoreBetweenObjectVariableNames?: false | 'Objects';
      /** Restrict what the schema exposes: operations (with tags), field states and `take`. See "Secure exposure". Default: not set (as 1.0.0) */
      exposure?: {
        /** Operations of every model: a list, or an object with tags. Ie: { findMany: ['loggedIn', 'canRead'], count: [] } */
        operations?: ExposureOperation[] | { inherit?: boolean } & Partial<Record<ExposureOperation, boolean | string | string[]>>;
        /** Maximum `take` of findMany and list relations. Not applied to findFirst, findUnique nor count */
        maxTake?: number;
        /** Where the manifest is written. Default: `<outputDir>/exposure.manifest.json` */
        manifest?: { path: string };
        /** Inputs and enums to keep in inputs.ts although no generated operation reaches them */
        keepInputs?: string[];
        models?: Record<string, {
          /** Ie: { passwordHash: 'hidden', email: 'guarded', phone: ['guarded', 'unfilterable'], role: 'readonly' } */
          fields?: Record<string, 'unfilterable' | 'readonly' | 'guarded' | 'hidden' | Array<'unfilterable' | 'readonly' | 'guarded' | 'hidden'>>;
          /** Replaces the global operations (unless `inherit: true`) */
          operations?: ExposureOperation[] | { inherit?: boolean } & Partial<Record<ExposureOperation, boolean | string | string[]>>;
          maxTake?: number;
        }>;
      };
    };
    /** Global config */
    global?: {
      /** A function to replace generated source */
      replacer?: Replacer;
      /** Location of builder to replace in all files. Relative to package root. ie: './src/schema/builder'. Default: './builder' */
      builderLocation?: string;
      /** Run function before generate */
      beforeGenerate?: (dmmf: DMMF.Document) => void;
      /** Run function after generate */
      afterGenerate?: (dmmf: DMMF.Document) => void;
    };
  }
  ```
</details>
<br/>

#### Run the generator

```sh
yarn prisma generate
```

or

```sh
npx prisma generate
```

## Usage

###  Inputs

You can use `@Pothos.omit()` function calls in your prisma schema field descriptions to control which fields are used in the generated input types.

- `@Pothos.omit()` Omits the field from all inputs
- `@Pothos.omit(create)` Omits field from the create input
- `@Pothos.omit(orderBy, where, update)` Omits field from the orderBy, where, and update inputs, but not the create input

The available options are `create`, `update`, `where`, and `orderBy`.

```prisma
model User {
  /// @Pothos.omit(create, update)
  id        String   @id @default(uuid())
  email     String
  /// @Pothos.omit()
  password  String
}
```

You can also augment/derive new inputs from the generated `inputs.ts` file.

```ts
// ./src/graphql/User/inputs.ts

import { Prisma } from '@prisma/client';
// Import generated input fields definition
import { UserUpdateInputFields } from '@/graphql/__generated__/inputs';

// Note: you can't use `builder.inputType` to generate this new input
export const UserUpdateInputCustom = builder
  .inputRef<Prisma.UserUpdateInput & { customArg: string }>('UserUpdateInputCustom')
  .implement({
    fields: (t) => ({
      ...UserUpdateInputFields(t),
      customArg: t.field({ required: true, type: 'String' }),
    }),
  });
```

### Objects

```ts
// ./src/graphql/User/object.ts

import { UserObject } from '@/graphql/__generated__/User';
import { builder } from '@/graphql/builder'; // Pothos schema builder

// Use the Object export to accept all default generated query code
builder.prismaObject('User', UserObject);

// Or modify it as you wish
builder.prismaObject('User', {
  ...UserObject,
  fields: (t) => {
    // Type-safely omit and rename fields
    const { password: _password, email: emailAddress, ...fields } = UserObject.fields(t);
    const sessionsField = UserSessionsFieldObject(t);

    return {
      ...fields,
      // Renamed field
      emailAddress,
      // Edit and extend field
      sessions: t.relation('sessions', {
        ...sessionsField,
        args: { ...sessionsField.args, customArg: t.arg({ type: 'String', required: false }) },
        authScopes: { admin: true },
      }),
      // Add custom fields
      customField: t.field({ type: 'String', resolve: () => 'Hello world!' }),
    };
  },
});
```

### Queries and Mutations

```ts
// ./src/graphql/User/query.ts

import { findManyUserQuery, findManyUserQueryObject } from '@/graphql/__generated__/User';
import { builder } from '@/graphql/builder'; // Pothos schema builder

// Use the Query exports to accept all default generated query code
builder.queryFields(findManyUserQuery);

// Use the QueryObject exports to override or add to the generated code
builder.queryFields((t) => {
  const field = findManyUserQueryObject(t);
  return {
    findManyUser: t.prismaField({
      // Inherit all the generated properties
      ...field,

      // Modify the args and use custom arg in a custom resolver
      args: { ...field.args, customArg: t.arg({ type: 'String', required: false }) },
      resolve: async (query, root, args, context, info) => {
        const { customArg } = args;
        console.log(customArg);
        return field.resolve(query, root, args, context, info);
      },

      // Add an custom extension
      authScopes: { admin: true },
    }),
  };
});
```

### Auto define all `objects`, `queries` and `mutations` (crud operations)

First, make sure that `options.crud.generateAutocrud` isn't set to `false`

```ts
// ./src/schema/index.ts (import autocrud.ts)
import {
  generateAllCrud,
  generateAllObjects,
  generateAllQueries,
  generateAllMutations
} from '@/graphql/__generated__/autocrud.ts',
import { builder } from '@/graphql/builder'; // Pothos schema builder

// (option 1) generate all objects, queries and mutations
generateAllCrud()

// (option 2) or create them separately
generateAllObjects()
generateAllQueries()
generateAllMutations()

// (option 3) or limit crud generation
generateAllObjects({ include: ["User", "Profile", 'Comment'] })
generateAllQueries({ exclude: ["Comment"] })
generateAllMutations({ exclude: ["User"] })

// Defining schema roots
builder.queryType({});
builder.mutationType({});

export const schema = builder.toSchema({});
```

Generated queries:

- count
- findFirst
- findMany
- findUnique

Generated mutations:

- createMany
- createOne
- deleteMany
- deleteOne
- updateMany
- updateOne
- upsertOne

### Examples

Check for the [example](/examples/inputs-simple-sqlite) for a running sample, and for [examples/secure-exposure](/examples/secure-exposure) for one that hides fields and applies guards and row filters through the runtime (see [Secure exposure](#secure-exposure)).

![image](https://user-images.githubusercontent.com/8796757/222917186-9a88f5e9-27c6-44b5-8653-fa9efb0aa255.png)

## Secure exposure

By default the generator emits **every** field and relation of every model, and list relations accept `where`/`orderBy`/`take` from the client. That is a leak waiting to happen: `findManyMatch { predictions { participant { email } } }` returns other users' emails, and `where: { participant: { email: { startsWith: "a" } } }` lets a client *deduce* an email without ever selecting it.

`crud.exposure` (1.1.0) lets you say what is exposed. The generator does **not** know any authorization library nor any business rule: it generates the schema with the restrictions you ask for, and emits typed hooks that your application fills with its own functions, through a small runtime package with no dependencies, published as the `/runtime` subpath of this same package (`@wokcito/prisma-generator-pothos-codegen/runtime`, compiled by `tsc`, in [`src/runtime`](/src/runtime)).

Two rules:

1. **Without `crud.exposure` the generated code is byte-identical to 1.0.0** (covered by golden files generated with 1.0.0). No new imports, no new files.
2. **Fields are visible by default, models are opt-in.** A field you do not mention is visible, writable and filterable, as in 1.0.0. But once you use `operations`, only the models you list in `models` are generated (see [Operations and tags](#operations-and-tags-operations)). And it **fails closed**: an incomplete configuration denies, or fails at startup, never allows silently.

### What you need to know

Most people need very little:

- **Do nothing:** everything is generated, as in 1.0.0.
- **Restrict what is exposed** (the same for every request): list the models you want, hide or lock fields, choose the operations and set `maxTake`. All of it is decided when you run `prisma generate`; there is nothing to install or call at runtime.
- **Permissions that depend on who asks** (user, role, tenant): mark fields as `guarded` and/or put tags on operations, and write a few plain functions in your app that you pass **once** to `configureExposure`. Install this package as a regular dependency (the generated code imports its `/runtime`).

If a rule is the same for everybody, generating is enough. If it depends on the requester, you need the runtime. What happens when you forget something is described in [Validation](#validation) and in [The runtime](#the-runtime): it fails when generating or when the app starts, it never lets data through silently.

```js
// ./pothos.config.js
/** @type {import('./src/graphql/__generated__/exposure.types').ExposureConfig} */
const exposure = {
  // Global: the default of the models listed in `models` below
  operations: { findMany: ['loggedIn', 'canRead'], findUnique: ['loggedIn', 'canRead'], count: ['canRead'] },
  maxTake: 50,
  models: {
    User: {
      fields: { passwordHash: 'hidden', tokens: 'hidden', email: 'guarded', phone: ['guarded', 'unfilterable'], role: 'readonly' },
      operations: { inherit: true, count: false }, // the global ones, without `count`
    },
    Post: {
      fields: { author: 'guarded', comments: 'hidden', published: 'readonly' },
      operations: { findMany: 'canRead', findUnique: 'canRead', count: 'canRead' }, // replaces the global ones
      maxTake: 10,
    },
  },
}

module.exports = { crud: { exposure } }
```

A complete, runnable version (with tests against a **real sqlite database**) is in [examples/secure-exposure](/examples/secure-exposure). `exposure.types.ts` (generated) types the config with the real names of your models and fields, so the editor autocompletes and rejects typos; `defineExposure` from the runtime is the same idea as a function.

> You do not need `/// @Pothos.omit()` comments in your `schema.prisma` for any of this. `@Pothos.omit()` still works exactly as before, but it only cleans **inputs**: the field stays on the GraphQL object. Use the states below to really hide a field. The fields hidden by `exposure` leave no trace in the generated code, not even a comment.

### Field states (`models.<Model>.fields`)

Each key is a scalar or a relation of the model; the value is a state or an array of states.

| State | Effect |
| --- | --- |
| *(none)* | Visible, writable and filterable, as in 1.0.0 |
| `'unfilterable'` | Out of `where`, `orderBy`, `distinct`, `cursor` and the aggregate order inputs |
| `'readonly'` | Visible, but out of the create and update inputs |
| `'guarded'` | Access decided by a function of your application (see [the runtime](#the-runtime)). A scalar becomes nullable and its resolver asks `canReadField`. A to-one relation is nullable and `null` when the row it points to is not readable |
| `'hidden'` | It does not exist: not in the object, not in any input or enum. Implies `unfilterable` and `readonly`, and can not be combined with other states |

- **Foreign keys.** `readonly` on a relation also applies to its foreign key fields (`authorId`) in the write inputs, otherwise `authorId` in a create input would be a way to assign it (mass assignment). `hidden` on a relation does **not** hide the foreign key (you decide that apart). `unfilterable` on a relation removes filtering and ordering by the relation, not by its foreign key.
- `guarded` on a list relation is an error: list relations are restricted with `scope`.
- **Which inputs.** *Filter/order* inputs (`where`, `whereUnique`, `scalarWhere`, `orderBy`, aggregate order inputs, `<Model>ScalarFieldEnum`) lose `hidden` and `unfilterable` fields. *Write* inputs (`create`, `update`, `createMany`, `updateMany`, unchecked variants, **and the nested ones**: `UserCreateWithoutPostsInput`, `UserUpdateWithoutPostsInput`...) lose `hidden` and `readonly` fields. Inputs that carry operations (`connect`, `connectOrCreate`, `WithWhere`, ...) are not touched field by field.
- A compound unique (`@@unique([userId, token])`) that contains a hidden or unfilterable field is dropped, with its entry in `WhereUniqueInput`.
- An input that ends up without fields is emitted with the `NEVER` scalar, which is defined **only if it is used** (see [Disclosures](#models-with-only-relations)).

### Operations and tags (`operations`)

Valid names: `findMany`, `findUnique`, `findFirst`, `count`, `createOne`, `createMany`, `updateOne`, `updateMany`, `upsertOne`, `deleteOne`, `deleteMany`.

| Form | Meaning |
| --- | --- |
| `['findMany', 'findUnique']` | Generated, without tags |
| `{ findMany: 'loggedIn' }` | Generated, with one tag |
| `{ findMany: ['loggedIn', 'canRead'] }` | Several tags; the order is kept |
| `{ count: [] }` or `{ count: true }` | Generated, without tags |
| omitted or `false` | Not generated |
| `[]` or `{}` | No operations |
| absent (global) | All of them, without tags (as 1.0.0) |

In a model, `operations` **replaces** the global ones (`{ count: [] }` leaves only `count`), unless it has `inherit: true` (`{ inherit: true, findMany: 'canRead' }`, `{ inherit: true, count: false }`). `inherit: true` without global `operations` is an error. Tags are opaque strings: the generator copies them to the manifest and to the `target` of each operation, and **your** `byTag({...})` gives them meaning.

`exposure.operations` replaces `excludeResolvers*` / `includeResolvers*`, which are **deprecated**: using both is an error, and without `exposure.operations` those options keep working as in 1.0.0 (they will be removed in a future major version).

**Only what you list is generated.** When `operations` is used (global or in a model), a model that is not in `models` has no operations: the global `operations` are the default of the models you list (`User: {}` is enough to give `User` the global ones), not of the whole schema. And a model with no operations that no **visible** relation reaches (a `hidden` relation does not count) is not generated at all: no object, no inputs, no entry in `autocrud.ts`, in `objects.ts` nor in the manifest, so it does not even show up in `__schema`. If a visible relation of a generated model reaches it, its object exists (it has to, to return it) but it has no queries nor mutations. The console lists the models that were left out.

### `maxTake`

`exposure.maxTake` (global) and `models.<Model>.maxTake` (the model wins) limit `take` in `findMany` and in list relations. The model that counts is the one of the **rows returned**: the model of the query, or the target model of a list relation. It does **not** apply to `findFirst`, `findUnique` nor `count` (a default cap would make counts wrong, and `findFirst` only accepts `take` of 1 or -1).

The generated code calls `clampTake(args.take, N)`: without `take` it is `N`, and it keeps the sign (a negative `take` paginates backwards, and it is capped too: `-1000` gives `-N`). `skip` and `cursor` still paginate past the cap.

### Validation

`crud.exposure` is validated when you generate (also with `crud.disabled: true`), **all the errors together**, with the path of the key and the valid values. Nothing is written when it fails:

```
Invalid pothos-codegen configuration:
 - crud.exposure.models.User.fields.emial: field "emial" does not exist on model "User". Available fields: id, email, ... (did you mean "email"?)
 - crud.exposure.maxTake: maxTake must be a positive integer, got 0
 - crud.exposure.models.AppClientAuth: model "AppClientAuth" has no unique identifier left after hiding [id, clientId], but findUnique, deleteOne, updateOne, upsertOne are still enabled. Disable them or hide other fields
```

It also rejects unknown keys at any level (with a suggestion), a configuration that generates no model at all (for instance `operations` without `models`: `crud.exposure: no model is generated ... list at least one, for instance models: { User: {} }`), a model with every scalar hidden (its `ScalarFieldEnum` would be empty), and a required column that clients can not write with `createOne`/`createMany` still enabled (they could never work: write your own mutation).

### Generated files

With `exposure`, three files more:

- `<outputDir>/exposure.ts`: registers the manifest in the runtime (`registerManifest`) and re-exports `configureExposure`, `byTag` and `assertExposureConfigured`. `objects.ts`, `autocrud.ts` and every generated file that uses the runtime import it, so the manifest is always registered.
- `<outputDir>/exposure.types.ts`: `ExposureConfig`, with your models and fields.
- `exposure.manifest.json` (`exposure.manifest.path` to change where; default `<outputDir>/exposure.manifest.json`): the same manifest, in a deterministic order (two runs write the same file): states, operations with their tags, effective `maxTake`, and relations with `isList`, `targetModel` and `fromFields`. Useful outside the app, for instance to compute the maximum cost of a query.

After generating, the console lists the models that use the default exposure, the models that were not generated and any warning, such as a repeated tag (information, it never fails the generation).

Every root query and mutation is wrapped like this (`flat` is `true` for `count`, `updateMany` and `deleteMany`, the fields that are not `prismaField`, the same list `autocrud.ts` uses):

```ts
export const findManyPostQueryObject = defineQueryFunction((t) => {
  const target = { kind: 'query', model: 'Post', operation: 'findMany', tags: ['canRead'] } as const;

  const operation = defineQueryPrismaObject({
    type: ['Post'],
    nullable: false,
    args: findManyPostQueryArgs,
    resolve: async (query, _root, args, _context, _info) =>
      await _context.prisma.post.findMany({
        where: mergeScope(target, args, _context),
        cursor: args.cursor || undefined,
        take: clampTake(args.take, 50),
        distinct: args.distinct || undefined,
        skip: args.skip || undefined,
        orderBy: args.orderBy || undefined,
        ...query,
      }),
  });

  return { ...operation, resolve: withExposure(target, operation.resolve, { flat: false }) };
});
```

> **Replacing `resolve` of a generated operation drops the wrapper** (guards and scope). If you override it, call `withExposure(target, resolve, { flat })` again.

### The runtime

The runtime is part of this package (`@wokcito/prisma-generator-pothos-codegen/runtime`, no dependencies). The generated code imports it when your application runs, so with `crud.exposure` install the package as a regular dependency (`npm install @wokcito/prisma-generator-pothos-codegen`), not only as a dev dependency.

You only need `configureExposure` (and `configureExposure`) if you use **tags** or **`guarded`** fields. An application that only uses `hidden`, `readonly`, `unfilterable`, `operations` without tags and `maxTake` does not call `configureExposure`.

```ts
import { byTag, configureExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';
import './graphql/__generated__/exposure'; // registers the manifest

configureExposure({
  guards: byTag({
    loggedIn: () => (_root, _args, ctx) => { if (!ctx.viewer) throw forbidden('UNAUTHENTICATED') },
    canRead: (t) => (_root, _args, ctx) => { if (!can(ctx, 'read', t.model)) throw forbidden('FORBIDDEN') },
  }),
  scope: (t, ctx) => (t.kind === 'relation' ? t.targetModel : t.model) === 'Post' ? { published: true } : undefined,
  fieldAccess: (_t, parent, ctx) => ctx.viewer?.role === 'admin' || parent.id === ctx.viewer?.id,
  fieldScope: (_t, ctx) => (ctx.viewer?.role === 'admin' ? undefined : { id: ctx.viewer?.id ?? -1 }),
});
```

The state of the runtime lives on `globalThis`, so duplicated copies of the package share it (an ESM and a CJS import, for instance).

| Export | What it is |
| --- | --- |
| `configureExposure(runtime)` | Sets `guards`, `scope`, `fieldAccess` and `fieldScope` (each a function or an array). Validates the setup against the manifest and throws all the problems together. Calling it again replaces the previous one |
| `registerManifest(manifest)` | Called by the generated `exposure.ts` |
| `assertExposureConfigured()` | Throws if the schema needs a runtime and `configureExposure` was not called. Call it before `listen` |
| `resetExposureForTests()` | Clears the manifest and the runtime |
| `byTag(factories)` | `guards` from the tags of the config. A tag without factory throws |
| `withExposure(target, resolve, { flat })` | Runs the guards of an operation before its resolver (used by the generated code) |
| `mergeScope(target, args, ctx)` | The `where` of the operation: client filters rewritten so hidden rows behave as if they did not exist, plus `scope` and `fieldScope` |
| `clampTake(take, max)` | Limits `take` keeping its sign |
| `canReadField(target, parent, ctx)` | `fieldAccess` of a guarded field, memoized per request. `false` without runtime |
| `isRowReadable(target, row, ctx, finder)` | Whether a guarded to-one relation may return its row (one query per batch) |
| `ExposureError` | `code: 'FORBIDDEN' \| 'INTERNAL'`, thrown when a request can not be served safely |
| `defineExposure(config)` | Identity function that types `crud.exposure` |

Four hooks, each one a function or an **array** of functions (composed as described below). The functions receive a target and return the neutral value (`undefined` or `true`) when they do not apply.

| Hook | What it decides | When it runs |
| --- | --- | --- |
| `guards` | Whether an operation runs. Allows or throws: it does not see nor change rows | Before Prisma, once per request, per operation (queries and mutations, not relations) |
| `scope` | Which rows are visible (or can be changed), as a Prisma `where`. Reads, `update*`, `delete*` and list relations; not `create*` | Merged into the `where`: `AND[client where, scope]` |
| `fieldAccess` | Which `guarded` fields of an already loaded row can be read. `false` gives `null`. Synchronous | Per field and row, memoized per request |
| `fieldScope` | The same as `fieldAccess`, as a `where` | Only when a client filters, orders, paginates by cursor or uses `distinct` on a `guarded` field |

Composition (fixed, the runtime does not know what is inside your functions):

| Hook | With several functions |
| --- | --- |
| `guards` | In the order of the tags; the first that throws stops the rest |
| `scope` | AND of the `where`s; `undefined` does not restrict |
| `fieldAccess` | The field is readable only if **every** function returns exactly `true` (`undefined`, `1`, `'yes'` deny; a function that throws propagates its error) |
| `fieldScope` | AND; `undefined` does not restrict |

`byTag({ tag: (target) => guard | guard[] })` builds `guards` from the tags of the config; a tag without factory throws `Tag "x" used by Post.findMany has no guard`. The `target` is `{ kind: 'query' | 'mutation', model, operation, tags }` (a `RelationTarget` `{ kind: 'relation', model, field, targetModel, isList }` in `scope`). Guards receive `(root, args, ctx, info)`.

**Startup validation.** The order does not matter (`registerManifest` and `configureExposure` validate when both are there). `configureExposure` throws, listing everything, if: a tag has no factory, a `guarded` field has no `fieldAccess`, there is `fieldAccess` but no `fieldScope` (filtering by a guarded field could not be protected), a guarded to-one relation has no `scope`, there are tags and no `guards`, or `upsertOne` is enabled and `scope` is configured (its `create` branch has no `where`: it can not be scoped). Call `assertExposureConfigured()` before `listen`: it throws when the manifest has tags or guarded fields and `configureExposure` was never called. And at request time it fails closed: an operation with tags and no runtime does not run, `canReadField` without runtime is `false`.

`configureExposure` twice replaces the configuration; `resetExposureForTests()` clears it.

**What `scope` does to filters.** The client `where` is rewritten so **a row that scope hides behaves as if it did not exist**, otherwise a filter is an oracle: `some`/`none` only count visible children, `every` is evaluated over the visible ones, `is`/`isNot`/direct filters of a to-one relation ignore an invisible target (`isNot` matches it, `is: null` means "no visible row"), at any depth and inside `AND`/`OR`/`NOT`. Filtering, ordering, paginating by cursor or `distinct` by a `guarded` scalar adds its `fieldScope` (a filter by `email` in `OR` is applied conservatively: it can hide rows the client would have seen, it never leaks). Ordering **through** a relation (also `_count`) whose target has restrictions is rejected with `ExposureError` (`code: 'FORBIDDEN'`). `findUnique`/`updateOne`/`deleteOne` keep the unique key on top and add the rest under `AND`, so a client `AND`/`OR`/`NOT` can not skip the scope; a row out of scope on a write raises Prisma's `P2025`, as if it did not exist.

> **`{ OR: [] }` means "no rows"** in `scope` and `fieldScope`, and it is safe to nest: Prisma ignores an empty `OR` when it is an element of an `AND` (`{ AND: [x, { OR: [] }] }` matches `x`, which would show what the scope hides), so the runtime replaces it with a condition on a real column that is false in every position (`{ id: { in: [] } }`).

**Guarded to-one relations.** Prisma does not accept a `where` on a to-one relation, so its scope can not filter the include. A `guarded` relation (`Post.author`) is nullable, loaded with its parent (its nested selection is preloaded, no query per parent) and returned only if the `scope` of the target includes it, checked with one query per level for all the rows of a batch (none at all when the scope does not restrict the target). A to-one relation without state returns the whole row to anyone who can read the parent: guard it when its model has restrictions.

**Writes.** `updateOne`, `updateMany`, `deleteOne` and `deleteMany` are scoped (`scope` receives `target.operation`, so it can return the scope of each action). `createOne`, `createMany` and `upsertOne` only run guards: the generator can not impose values from the context (for instance the author), **write them by hand**. Keep `keepInputs` in mind for that (below).

### Inputs are pruned

With `exposure` (and crud enabled) `inputs.ts` only has what the enabled operations and the objects reach (breadth first over the fields that are emitted): fewer types for Pothos to build, no inputs of operations that do not exist, no noise in introspection. The scalars (`DateTime`, `Json`, `Decimal`, `Bytes`, `BigInt`) and `NEVER` are defined according to what is emitted. `@Pothos.omit` keeps working and composes with the states.

If your own resolvers use an input that no generated operation reaches (say `UserCreateInput` for the `createUser` you wrote by hand), keep it: `exposure.keepInputs: ['UserCreateInput']` keeps it and everything it reaches. Without crud (`crud.disabled: true`) nothing is pruned.

### What changes for the clients of your API

Nothing without `crud.exposure`. With it, the GraphQL schema changes, and that is what a frontend sees:

- **Removed from the schema:** `hidden` fields (in the object and in every input), `unfilterable` fields in `where`/`orderBy`/`distinct`, `readonly` fields in create and update inputs, the operations you did not enable, the models you did not list, and the inputs that no operation reaches. A query or mutation that still uses them fails validation, so validate your operations against the new schema (or regenerate the types with `graphql-codegen` and let the compiler tell you).
- **Nullable now:** a `guarded` scalar, and a guarded to-one relation, are nullable even if Prisma requires them, and arrive as `null` for whoever is not allowed to read them.
- **Capped lists:** with `maxTake`, `findMany` and list relations return at most N rows even if the client sends no `take`; paginate with `skip` or `cursor`.
- **Rows the requester can not see do not exist:** with `scope`, counts and lists differ per requester, `findUnique` of a hidden row is `null`, and an `update`/`delete` of one fails as "not found".
- **Errors:** what your guards throw (`UNAUTHENTICATED`, `FORBIDDEN`... you choose the code) reaches the client as GraphQL errors, and ordering through a restricted relation is rejected with `ExposureError` (`code: 'FORBIDDEN'`).

### Limitations

- `createOne`/`createMany` can not impose values from the context; `upsertOne` can not be scoped by row.
- A guarded to-one relation costs one extra query per level (per batch of rows), and it needs the target to have a single-field `@id`.
- `fieldAccess` runs per field and row; with nested lists `maxTake` bounds the total and the per-request memoization avoids repeating calls.
- The hoisting of `fieldScope` is conservative: it can hide rows the client would see with an `OR`, but it never leaks.
- Ordering through a relation is rejected when the target has restrictions.
- Depth and complexity limits, aliases, batching, introspection and verbose errors belong to your HTTP/GraphQL server. The manifest (relations, lists, `maxTake`) lets you compute a maximum cost from outside.
- The code emitted for a guarded relation calls the Prisma client through `prismaCaller` from the object file: if your `resolverImports` use relative paths, use absolute (aliased) specifiers, because those imports are also added there.

### Migrating from the pre-release API

An earlier draft of `crud.exposure` (never published) had `exposure.{neverExposed, restricted, relations, allowToOne}`, `crud.hooks` and `crud.maxTake`. This version replaces them, and the hooks (strings of code) are gone:

| Pre-release | 1.1.0 |
| --- | --- |
| `exposure.neverExposed: { User: ['password'] }` | `models.User.fields.password: 'hidden'` |
| `exposure.restricted: { User: ['email'] }` | `models.User.fields.email: 'guarded'` |
| `exposure.relations` (allowlist) | `'hidden'` on the relations you do not want (hidden is a denylist now: what you do not mention is visible) |
| `exposure.allowToOne` | No longer exists. Use `'guarded'` on the to-one relation, or nothing |
| `hooks.wrapOperation` / `scopeWhere` / `inputCheck` | Tags in `operations` + `configureExposure({ guards: byTag(...), scope })` |
| `hooks.relationScope` | `scope` receives a `RelationTarget` |
| `hooks.fieldGuard` | `fieldAccess` (and `fieldScope` for filters) |
| `crud.maxTake` | `exposure.maxTake` (and `models.X.maxTake`) |

Also fixed: a hidden field left `NEVER` undefined when it emptied an input; `maxTake` broke `findFirst` and a negative `take` skipped it; the config file could not be loaded on Windows (`import()` of an absolute path); unknown keys were ignored; and the README claimed that the nested `XCreateWithoutYInput` inputs kept the hidden fields (they never did: they are write inputs of the model).

### Naming variants

The options compose with `underscoreBetweenObjectVariableNames`, `exportEverythingInObjectsDotTs` and `mapIdFieldsToGraphqlId` (for instance, a guarded `@id` keeps `String(parent.id)` and `"ID"`), and hidden fields are also removed from the `index.ts` of every model and from `objects.ts`.

## Disclosures

### Models with only relations

- We create a custom scalar `NEVER` that avoids this error: `Input Object type FollowUpdateManyMutationInput must define one or more fields.` from Graphql. if you have models that are relations-only. Like N-N fields without `no relation fields` or id-only models, we set field `_` of some operations to this scalar. If you fill this fake property, the operation will result in a error.

### `inputs.ts` is not type checked

`inputs.ts` starts with `// @ts-nocheck`, as in 1.0.0: its helper types (`Filters`) name the `*FieldUpdateOperationsInput` types of Prisma, and a schema only has the ones of the scalars it uses (a schema without `BigInt` has no `BigIntFieldUpdateOperationsInput`), and deep input types also hit "Excessive stack depth comparing types". This also means `tsc` does not see errors in that file: the tests of this repository check it another way (every identifier it uses is defined, the example builds the real schema with `builder.toSchema()`).

### BigInt rename

- As `BigInt` is reserved, we export `Bigint` for the BigInt scalar.
