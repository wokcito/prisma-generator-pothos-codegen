# Plan de migración a Prisma 8 — `prisma-generator-pothos-codegen`

Fecha: 2026-09-14
Estado de Prisma 8 al investigar: **GA / `prisma@latest` desde 2026-08-28** (antes `prisma-next` / RC). Prisma 7 sigue soportado como **`prisma@prev`**.
Alcance de este documento: solo **plan**. No se cambió código.

> **UPDATE rama `prisma-8` (2026-09-14): implementado.** Veredicto Pothos: `@pothos/plugin-prisma` clásico nunca soportará Prisma 8 (sin generadores/DMMF); el sucesor es `@pothos/plugin-prisma-next` (`hayes/pothos#1618`, `#1627`, ya en `main` pero `private:true`, sin publicar en npm). Decisión: TDD contra la API de `plugin-prisma-next` (clonado en `/tmp/pothos` como referencia; el tarball `pkg.pr.new@1627` es el draft viejo con peers `@prisma-next/*` retirados — no usable). Hecho en la rama: jest→vitest, `prisma@8.0.0-rc.15` + `@prisma/orm-postgres@8.0.0-rc.11`, fuente `contract.json` (`src/contract/`), generadores puros (inputs + CRUD estilo plugin-next), CLI standalone (`--contract`), `bun run fullcheck` verde (51 tests + `tsc --noEmit`). Detalles abajo en esta misma estructura.

## 1. Resumen ejecutivo

**No es un bump de versión. Es una re-arquitectura.**

Este proyecto es un **generador custom de Prisma** (`generatorHandler` de `@prisma/generator-helper` + `DMMF.Document` + `getDMMF` de `@prisma/internals`). Todo su diseño asume el stack Prisma 7:

- `schema.prisma` con bloques `generator` + `datasource`,
- `prisma generate` como punto de entrada,
- DMMF (`datamodel.models`, `schema.inputObjectTypes.prisma`, `schema.enumTypes.prisma`) como fuente de verdad,
- `@prisma/client` v7 (`Prisma.*Input`, `prisma.user.findMany`, `take`/`skip`) como runtime objetivo,
- `@pothos/plugin-prisma` v4 (`definePrismaObject`, `prisma-pothos-types`, `getDatamodel()`) como consumidor del código generado.

Prisma 8 cambia **las 5 cosas a la vez**:

| Prisma 7 (actual) | Prisma 8 |
|---|---|
| `schema.prisma` + `generator` + `datasource` | `contract.prisma` (o `contract.ts`) **sin bloques `generator`/`datasource`** |
| `prisma generate` → DMMF → `GeneratorOptions` | `prisma contract infer` → `prisma contract emit` → `contract.json` + `contract.d.ts` |
| `@prisma/generator-helper` / `@prisma/internals#getDMMF` / `DMMF.Document` | **No hay protocolo de generadores documentado en v8.** El toolchain lee `contract.json`, no DMMF |
| `@prisma/client` + driver adapters (`@prisma/adapter-pg`, etc.), `prisma.user.findMany({ where, take, skip })` | `@prisma/orm-postgres` (`db.orm.public.User.include(...).all()`, `.create()`), `take`/`skip` → **`limit`/`offset`**, `db.sql.raw` → **`db.raw.sql`** |
| `prisma.config.ts` con `defineConfig({ schema, migrations, datasource })` | `prisma.config.ts` con **`definePrismaConfig({ orm: ormConfig({ contract, output, db, extensions }) })`** |
| Soporta PostgreSQL, MySQL, SQLite, SQL Server | **Solo PostgreSQL (maduro) + MongoDB. SQLite “planned next”, MySQL después.** |
| Atributos nativos `@db.Uuid`, `@db.VarChar(191)` | **Eliminados.** Se escriben en posición de tipo: `Uuid`, `VarChar(191)` |
| CLI `prisma` = v7 | `prisma@latest` = v8, `prisma@prev` / `@prisma/prisma7` = v7. Binarios `prisma` vs `prisma7` |

Consecuencias directas para este repo:

1. **El entrypoint `src/generator.ts` deja de funcionar en un proyecto Prisma 8 puro.** No hay `generatorHandler`, no hay `onGenerate(options: GeneratorOptions)`, no hay `options.dmmf`.
2. **Los tests (`src/tests/getPrismaSchema.ts`) que usan `getDMMF({ datamodel })` de `@prisma/internals@7` no sirven para v8.** Habría que leer `contract.json` / `contract.d.ts` o el nuevo compilador de contratos.
3. **Todo el código generado (inputs + CRUD) es inválido contra Prisma 8**, porque emite tipos `Prisma.*` de v7 y resolvers `prisma.model.findMany/findUnique/count` con `take`/`skip` y `...query` de `@pothos/plugin-prisma`.
4. **`@pothos/plugin-prisma@4.x` no soporta Prisma 8** (sigue documentando `generator pothos { provider = "prisma-pothos-types" }` + `npx prisma generate` + `@prisma/client`). Sin Pothos-para-v8 no hay objetivo válido para el CRUD generado.
5. **El ejemplo `examples/inputs-simple-sqlite` es hoy inmigrable a v8**: usa `provider = "sqlite"`, y SQLite aún no está soportado en Prisma 8.

**Recomendación:** no migrar el código todavía. Hacer la migración en 3 horizontes:

- **H0 (ya):** blindar Prisma 7 (pinear `prisma@prev`, CI en verde, matriz de compatibilidad).
- **H1 (spike, 1–2 semanas):** prototipo que lea `contract.json` de Prisma 8 y mida qué % del DMMF se puede reconstruir; decidir si el proyecto será **dual (7 + 8)** o **rewrite a CLI standalone**.
- **H2 (solo cuando se desbloquee):** implementar soporte v8 cuando haya (a) Pothos compatible con v8 o decisión de cambiar de runtime, y (b) soporte SQLite/MySQL si se quiere mantener el ejemplo, o migrar el ejemplo a Postgres.

Detalles y tareas abajo.

---

## 2. Estado actual (inventario verificado en el repo)

### 2.1 Dependencias Prisma 7

`package.json` raíz:

- `peerDependencies`: `@prisma/client@^7.10.0`, `prisma@^7.10.0`, `@pothos/core@^4.0.2`, `@pothos/plugin-prisma@^4.0.3`
- `dependencies`: `@prisma/generator-helper@7.10.0` (pin exacto)
- `devDependencies`: `@prisma/internals@7.10.0` (solo para tests), `typescript@5.9.3`

`examples/inputs-simple-sqlite/package.json`:

- `@prisma/adapter-better-sqlite3@7.10.0`, `@prisma/client@7.10.0`, `prisma@7.10.0` (dev), `@pothos/core@4.14.0`, `@pothos/plugin-prisma@4.16.0`

### 2.2 Puntos de acoplamiento a Prisma 7 (todos en `src/`)

| Archivo | Acoplamiento |
|---|---|
| `src/generator.ts` | `generatorHandler({ onManifest, onGenerate })` de `@prisma/generator-helper`. `requiresGenerators: ['prisma-client-js', 'prisma-pothos-types']`, `options.dmmf`, `options.generator.config`, `options.schemaPath` |
| `src/utils/config.ts` | `ExtendedGeneratorOptions = GeneratorOptions & { generatorConfigPath }`, `DMMF.Document` en `beforeGenerate/afterGenerate` |
| `src/inputsGenerator/index.ts`, `utils/parts.ts`, `utils/dmmf.ts`, `utils/parser.ts`, `utils/inputFields.ts` | `import type { DMMF } from '@prisma/generator-helper'`. Leen `dmmf.schema.inputObjectTypes.prisma`, `dmmf.schema.enumTypes.prisma`, `dmmf.datamodel.models/enums` |
| `src/crudGenerator/index.ts`, `utils/generator.ts`, `utils/objectFields.ts`, `templates/*` | Leen `dmmf.datamodel.models`. Plantillas emiten `prisma.model.findMany/findFirst/findUnique/count`, args `where/orderBy/cursor/take/skip/distinct`, `...query` de Pothos |
| `src/tests/getPrismaSchema.ts` | `getDMMF({ datamodel })` de `@prisma/internals`. Lee `simpleSchema.prisma` y `complexSchema.prisma` locales |
| `examples/inputs-simple-sqlite/prisma/schema.prisma` | `datasource db { provider = "sqlite" }`, `generator client { provider = "prisma-client-js" }`, `generator pothos { provider = "prisma-pothos-types", generateDatamodel = "true" }`, `generator pothosCrud { provider = "ts-node --transpile-only ../../src/generator.ts" }` |
| `examples/inputs-simple-sqlite/prisma.config.ts` | `defineConfig({ schema, datasource: { url: 'file:./dev.db' } })` estilo v7 |

### 2.3 Lo que genera hoy (y por qué no corre en v8)

- `inputs.ts`: `import { Prisma } from '.prisma/client'`, tipos `Prisma.UserWhereInput`, scalars `DateTime/Decimal/Bytes/Json/BigInt`, `builder.inputType(...)`. En v8 no existe `.prisma/client` ni namespace `Prisma.*`.
- `crud/<Model>/queries.ts|mutations.ts|object.base.ts`: `prisma.user.findMany({ where, cursor, take, skip, orderBy, ...query })`. En v8 es `db.orm.public.User.include(...).orderBy(...).limit().offset().all()`, sin `...query` de Pothos.
- `objects.ts` / `autocrud.ts` / `utils.ts`: `definePrismaObject`, `defineFieldObject`, `defineRelationObject` de Pothos v4. Sin plugin Pothos-para-v8, este código no tiene runtime.

---

## 3. Qué cambia en Prisma 8 (síntesis de la investigación)

Fuentes: docs Prisma 8 (`/docs/orm`, `/docs/guides/upgrade-prisma-orm/postgresql`, `/docs/cli/*`, `/docs/orm/contract-authoring/*`) y changelog 2026-06 → 2026-08-28. Versiones de referencia: `prisma@8.0.0-rc.14` (CLI), `@prisma/orm-postgres@8.0.0-rc.10`, `@prisma/cli-engine@0.3.0`, `@prisma/prisma7@7.10.0-dev.58`.

1. **Nuevo modelo mental: contrato, no cliente generado.**
   Se autorea `prisma8/contract.prisma` (PSL) o `contract.ts` (builder TS), se emite con `prisma contract emit` a `contract.json` + `contract.d.ts`. Queries, migraciones y verificación leen esos artefactos. No hay `output = ".../generated/prisma"` con query engine empaquetado.
2. **Nuevo config.** `prisma.config.ts` pasa de `defineConfig({ schema, migrations, datasource })` (import `prisma/config`) a `definePrismaConfig({ orm: ormConfig({ contract, output, db: { connection }, extensions }) })` (imports `prisma/config` + `@prisma/orm-postgres/config` o `@prisma/orm-mongo/config`). Un `prisma.config.ts` v7 bajo el nombre `prisma.config.ts` es **rechazado** por el CLI v8.
3. **Nuevo flujo de migraciones.** `prisma migration plan --name X` → `prisma db migrate --advance-ref db` → `prisma db verify` / `prisma db sign` / `prisma migration status`. Conceptos nuevos: **contract hash, migration package, marker en DB, refs (`db`)**. Baseline obligatorio al tomar ownership desde v7 (`migration plan --name baseline` + `db sign` + `migration ref set db <ts>_baseline`).
4. **Nueva API de queries.** `db = postgres<Contract>({ url, contractJson })`; `db.orm.public.User.include("posts", ...).orderBy(u => u.id.asc()).all()`, `.create(body)`. Sin objeto único de opciones. `take`/`skip` → `limit`/`offset`. `db.sql.raw` → `db.raw.sql`.
5. **Cambios de schema language.** Se eliminan `@db.*` (`String @db.Uuid` → `Uuid`). Indexes de expresión/parciales/únicos se autoran en el contrato. Enums nativos de Postgres se leen como unions. Temporal columns y `_id` de Mongo tienen codecs distintos.
6. **Coexistencia oficial 7 ↔ 8.** `npm i -D prisma@latest` (v8, binario `prisma`) + `npm i -D @prisma/prisma7@7.10.0-dev.58` (v7, binario `prisma7`, config `prisma7.config.ts`). Misma DB, migraciones owned por una sola versión a la vez. Repos de ejemplo: `prisma/prisma8-and-7-example` (tags `step-0`…`step-3`).
7. **Requisitos.** Node **22.18+ (24.11+ en línea 24, 24 recomendado)**, TS **5.3+**, `module: nodenext` (o `esnext` + `bundler`) + `resolveJsonModule: true` por el `import ... with { type: "json" }` de `contract.json`.
8. **Soporte de DBs recortado.** Solo **PostgreSQL y MongoDB**. SQLite y MySQL vienen después. Esto bloquea el ejemplo SQLite.
9. **CI.** `db verify`, `db sign`, `migration check` ahora exiten **4** en findings (antes 1) y **2** si no pueden correr.
10. **Sin historia para generadores custom.** Toda la doc v8 habla de `contract emit`, extensiones (`@prisma/orm-extension-*`), middleware y skills de agente. No hay equivalente documentado de `generator ... { provider = "mi-generador" }`, `onManifest/onGenerate`, ni DMMF vía `GeneratorOptions`. Hay que asumir que **el protocolo `prisma generate` + DMMF muere en v8** hasta prueba en contrario (ver spike S1).

---

## 4. Análisis de impacto por pieza del proyecto

### 4.1 `src/generator.ts` — REESCRIBIR
`generatorHandler` no existe en el mundo v8. Opciones: (a) mantenerlo solo para v7 y crear un segundo entrypoint `src/contract-generator.ts` que lea `contract.json`; (b) convertir el proyecto en CLI standalone (`prisma-pothos-codegen --contract ./generated/prisma8/contract.json`). En ambos casos `onManifest.requiresGenerators` y `defaultOutput` desaparecen.

### 4.2 Tipos DMMF (`@prisma/generator-helper`) — SUSTITUIR
~10 ficheros importan `type { DMMF }`. En v8 la fuente sería `contract.json` (modelos, fields, relations, `@@map`, storage names, extension types como `Vector(1536)`, `Address` value objects, `Priority` typed enums). Hay que definir un `ContractDocument` propio + adaptador `contractToDmmfLike` si se quiere reutilizar la lógica de `inputsGenerator`/`crudGenerator`, o reescribir los parsers. Ojo: el contrato v8 lowercases modelos sin `@@map` y exige `@@map("User")` al inferir desde v7 — el mapeo de nombres cambia.

### 4.3 `getDMMF` de `@prisma/internals` (tests) — SUSTITUIR
Los fixtures `simpleSchema.prisma` / `complexSchema.prisma` son v7 (con `datasource`/`generator`). Para v8 habría que: escribir `contract.prisma` equivalentes, correr `prisma contract emit` (requiere DB solo para `infer`, no para `emit`), y cargar el `contract.json` resultante en tests. `getDMMF({ datamodel })` no sirve para validar paridad v8.

### 4.4 Generación de inputs — REDISEÑAR
Los filtros `Where/ScalarWhere/OrderBy/UpdateOperations/Compound` que hoy se copian del DMMF (`inputObjectTypes.prisma`) no existen como tal en el contrato. Habría que **derivarlos del contrato + query builder v8** (operadores reales: qué filtros/orderBy soporta `db.orm.*`). Riesgo alto de generar inputs que el runtime v8 no acepta.

### 4.5 Generación de CRUD — REDISEÑAR O CONGELAR
Los resolvers emitidos hoy son API v7 + Pothos v4. En v8 cambian: paginación (`limit`/`offset`, `reverse()` para cursor backward), sin `take`/`skip`/`distinct` con la misma semántica, sin `...query` de optimización Pothos. Y sin `@pothos/plugin-prisma` para v8 no hay `definePrismaObject` equivalente. **Este es el bloqueador funcional mayor.**

### 4.6 `examples/inputs-simple-sqlite` — NO MIGRABLE AÚN
SQLite no soportado en v8. Camino: o se congela en v7, o se crea un segundo ejemplo `examples/*-postgres` con Docker/Prisma Postgres para el spike v8. El `schema.prisma` del ejemplo además usa `generateDatamodel = "true"` y `clientOutput`, conceptos v7/Pothos-v4 sin equivalente v8.

### 4.7 Peer deps y packaging — ROMPER O DUALIZAR
`peerDependencies` actuales (`prisma@^7.10.0`, `@prisma/client@^7.10.0`) excluyen v8 por diseño. Para dual habría que: `peerDependenciesMeta` opcionales, o publicar `v2` para v8, o separar en dos paquetes (`@wokcito/prisma-generator-pothos-codegen` v1 = v7, `@wokcito/prisma-8-pothos-codegen` experimental). `bin.prisma-generator-pothos-codegen` hoy invoca `generatorHandler` (stdin JSON protocol); en v8 sería un binario normal.

---

## 5. Bloqueadores y riesgos (ordenados)

1. **[BLOQUEADOR] Sin runtime Pothos para Prisma 8.** `@pothos/plugin-prisma@4.x` y `prisma-pothos-types` son v7-only. Alternativas: esperar a Pothos, contribuir soporte, o cambiar el objetivo generado (p. ej. Pothos sin plugin Prisma, o GraphQL Yoga + resolvers manuales). Sin esta decisión, el CRUD v8 no tiene forma final.
2. **[BLOQUEADOR] Sin protocolo de generadores en v8.** Si `prisma generate` ya no invoca generadores custom, el producto “prisma-generator” deja de tener sentido como tal. El spike S1 debe confirmarlo con un `generator` dummy en `contract.prisma`.
3. **[BLOQUEADOR] SQLite.** El ejemplo y probablemente usuarios usan SQLite/MySQL. Prisma 8 hoy = Postgres/Mongo. Hay que segmentar: v8 solo para Postgres al inicio.
4. **[ALTO] Divergencia DMMF ↔ contract.** Value objects (`type Address`), named types (`Uuid = String @db.Uuid`), base models con variants, extension types, `@@map` obligatorio: el parser actual no los contempla.
5. **[ALTO] Superficie de queries v8 en RC.** La API (`limit`/`offset`, `reverse()`, `include`, `createAll`/`createAndCount`, SQL builder, middleware `beforeQuery/interceptQuery/...`) aún cambia entre RCs. Generar código contra un RC es apuntar a un blanco móvil. Fijar RC exacto en el spike y presupuestar re-trabajo.
6. **[MEDIO] Toolchain.** Node 24, `nodenext`, import attributes, `resolveJsonModule`, `prisma` vs `prisma7`, `prisma.config.ts` vs `prisma7.config.ts`, exit codes 4/2 en CI.
7. **[MEDIO] Migraciones de usuarios.** Quien adopte el generador v8 tendrá que hacer el handoff `baseline + sign + ref` de la guía oficial. Nuestra doc debe integrarse con ella, no reinventarla.

---

## 6. Opciones estratégicas

### Opción A — Quedarse en Prisma 7 (recomendada a corto plazo)
Pinear `prisma@prev`, seguir publicando v1 para v7. Costo ~0, riesgo ~0. Prisma 7 sigue soportado y es lo que Pothos soporta. **Hacer esto sí o sí como H0**, migremos o no a v8 después.

### Opción B — Soporte dual 7 + 8 en el mismo paquete
Mantener `src/generator.ts` (v7) + añadir `src/contract-generator.ts` (v8, lee `contract.json`). Pros: un solo paquete, migración gradual de usuarios (igual que la guía side-by-side de Prisma). Contras: doble parser, doble suite de fixtures, matriz CI ×2, riesgo de que el lado v8 nazca obsoleto en cada RC.

### Opción C — Nuevo paquete / CLI standalone para v8
`prisma-pothos-codegen --contract ./generated/prisma8/contract.json --out ./src/generated`. Desacopla del CLI de Prisma (sobrevive a que maten `prisma generate`). Pros: diseño limpio para el mundo contrato. Contras: rompe compatibilidad de UX (`generator pothosCrud { provider = ... }` desaparece), hay que re-documentar todo.

### Opción D — Esperar a GA + Pothos + SQLite
No escribir código v8 hasta que: Prisma 8 GA (no RC), `@pothos/plugin-prisma` (o sucesor) declare soporte v8, y SQLite/MySQL estén soportados si se necesitan. Mientras tanto, solo H0 + spikes de lectura. Es legítimo: el costo de generar contra un RC inestable supera al beneficio.

**Recomendación de este plan:** **A ahora + B como diseño objetivo**, con **puerta de salida a C** si el spike S1 confirma que no hay protocolo de generadores en v8. **D como guardarraíl**: no publicar soporte v8 estable antes de GA + Pothos.

---

## 7. Plan por fases

### H0 — Blindar Prisma 7 (0.5–1 día, hacer ya)

- [ ] H0.1 — Pinear Prisma 7 donde haya `latest`: `package.json` raíz y `examples/*/package.json`: `prisma@^7.10.0` ya está bien; añadir nota en README: “Prisma 8 no soportado aún; no usar `prisma@latest`”.
- [ ] H0.2 — Fijar lockfiles (`bun.lock`) y CI contra `prisma@7.10.0` exacto. Verificar `bun run fullcheck` en verde.
- [ ] H0.3 — Documentar matriz actual: Node `>=20.19`, TS `5.9.3`, `@pothos/*@4.x`, `better-sqlite3`. Guardar `dmmf.json` actual como snapshot de referencia (ya existe `dmmf.json` en raíz — versionarlo o moverlo a `fixtures/`).
- Criterio de salida: `bun run test && bun run tscheck && cd examples/inputs-simple-sqlite && bun run generate && bun run tscheck` en verde con `prisma@7.10.0`.

### H1 — Spikes de investigación (1–2 semanas, sin publicar)

**S1 — ¿Existe `prisma generate` / generadores custom en v8?**
- [ ] Crear `spike-v8/` fuera del `src` (no contaminar el paquete): `npm i -D prisma@latest` + `npm i @prisma/orm-postgres`.
- [ ] `npx prisma orm init` (o `create-prisma@latest`) con Postgres local/Docker.
- [ ] Añadir a `contract.prisma` un bloque `generator dummy { provider = "node ./dummy.js" }` y correr `prisma generate` / `prisma contract emit`. Registrar: ¿lo invoca? ¿con qué payload? ¿hay DMMF? ¿error?
- [ ] Probar `prisma --version`, `prisma contract infer --output`, `prisma contract emit`, `prisma migration plan`, `db verify`.
- Salida: tabla “comando v7 → equivalente v8 → ¿sirve al generador?” y veredicto B vs C.

**S2 — Forma real de `contract.json` / `contract.d.ts`**
- [ ] Inferir contrato desde una DB Postgres con el schema del ejemplo (portar `simpleSchema.prisma` a Postgres, añadir `@@map` donde falte, quitar `@db.*`, borrar modelo `_prisma_migrations` inferido).
- [ ] Guardar `contract.json` de ejemplo en `spike-v8/artifacts/`. Mapear campo a campo contra `DMMF.Document`: models, fields (scalar/object/enum, required/list, `@id`, `@unique`, `@relation`, `@map`), enums, indexes. Listar lo que **no** tiene equivalente directo (value objects, named types, extension types, variants).
- Salida: `CONTRACT_MAP.md` (borrador) + fixture `contract.sample.json`.

**S3 — Compatibilidad Pothos**
- [ ] Revisar `hayes/pothos` (issues/PRs “prisma 8” / “orm-postgres” / “contract”). Probar si `prisma-pothos-types` corre contra un proyecto v8.
- [ ] Prototipar el mínimo resolver Pothos→v8 a mano (un `User.findMany` con `db.orm.public.User...all()` + `builder.prismaField` o `builder.field` sin plugin) y anotar qué optimización (`...query`, `include` selectivo, counts, connections relay) se pierde.
- Salida: decisión “CRUD v8 = Pothos-con-plugin / Pothos-sin-plugin / otro stack”.

**S4 — Riesgo SQLite/MySQL**
- [ ] Confirmar en docs v8 el estado de SQLite/MySQL a la fecha del spike. Si siguen sin soporte, decidir: ejemplo v8 solo Postgres (+ `docker-compose.yml`), ejemplo SQLite congelado en v7.

Criterio de salida H1: documento de decisión B vs C + estimación H2 con el RC de Prisma 8 fijado (p. ej. `8.0.0-rc.14`).

### H2 — Implementación dual (solo tras H1, estimar entonces; orden tentativo)

1. **Toolchain dual.**
   - `package.json`: mover `@prisma/generator-helper@7` y `@prisma/internals@7` a `dependencies` del lado v7 o a `dev` + `peerDependenciesMeta` opcionales; añadir `devDependencies` para v8 (`prisma@<rc-fijado>`, `@prisma/orm-postgres@<rc-fijado>`). Scripts separados: `generate:v7` (`prisma7 generate`) vs `contract:emit` (`prisma contract emit`). `tsconfig.json`: `module: nodenext`, `resolveJsonModule: true` donde toque (cuidado: no romper el build CJS/ESM actual del paquete — probablemente haya que aislar el spike en `examples/` primero).
2. **Abstracción de schema.**
   - Nuevo `src/schema/` con `SchemaDocument` neutro (modelos, fields, enums, relations) + dos loaders: `loadDmmf(options: GeneratorOptions)` (v7, código actual) y `loadContract(contractJson)` (v8, nuevo). Adaptador `contractToSchema`.
   - Re-puntear `inputsGenerator` y `crudGenerator` a `SchemaDocument` en vez de `DMMF.Document`. Mantener firmas v7 como wrappers para no romper API pública (`Config.beforeGenerate/afterGenerate(dmmf)` — añadir overload con `SchemaDocument` o nuevo hook).
3. **Inputs v8 (antes que CRUD).**
   - Generar inputs derivados del contrato real, no por copia del DMMF. Estrategia: empezar por `Where/OrderBy/WhereUnique` simples + scalars (`DateTime/Decimal/Bytes/Json/BigInt`), validar contra queries v8 reales en el ejemplo Postgres. `simple: true` primero.
   - Actualizar `prismaImporter` (ya no `.prisma/client`) y `getUsedScalars` (el contrato puede no reportar scalars igual).
4. **CRUD v8 (después, y solo con decisión S3).**
   - Nuevas plantillas `templates-v8/`: `limit`/`offset` en vez de `take`/`skip`, `db.orm.public.<Model>` en vez de `prisma.<model>`, sin `...query` salvo que Pothos-v8 lo reponga. `count`, `findUnique`, `findFirst` con semántica v8 (`reverse()` si aplica).
   - `prismaCaller` por defecto cambia (`_context.prisma` → p. ej. `_context.db.orm.public` o inyección `db`).
5. **Ejemplos y docs.**
   - Nuevo `examples/inputs-simple-postgres-v8/` (Postgres + `prisma.config.ts` v8 + `contract.prisma` + `contract emit` + `migration plan/baseline/sign/ref` según guía oficial). Mantener `inputs-simple-sqlite` en v7.
   - README con matriz: “v1.x = Prisma 7 (estable). v2/canary = Prisma 8 (RC, Postgres-only, Pothos según S3)”.
6. **CI.**
   - Jobs separados `test:v7` (actual `fullcheck`) y `test:v8` (generate v8 + tscheck ejemplo Postgres). Pinear RCs. Añadir chequeo de exit codes 4/2 en `db verify`/`migration check` cuando se automaticen.
7. **Release.**
   - No publicar `latest` con soporte v8 hasta GA de Prisma 8. Publicar como `next`/`canary` o major nueva (`2.0.0-next.0`). `peerDependencies`: v7 (`@prisma/client@^7`, `prisma@^7`) vs v8 (`prisma@^8`, `@prisma/orm-postgres@^8`) en ramas distintas o con `peerDependenciesMeta` + doc clara. Actualizar `engines.node` a `>=22.18` para el lado v8 si se unifica el paquete.

### H3 — Retiro de Prisma 7 (futuro, cuando Pothos + DBs lo permitan)
- Migrar ejemplos restantes a v8, deprecar `generatorHandler`, eliminar `@prisma/generator-helper` / `@prisma/internals@7`, publicar major solo-v8. Conservar rama `1.x` para fixes v7.

---

## 8. Tareas concretas propuestas (para convertir en issues)

- [ ] `#1` Blindaje v7: pin `prisma@prev`, README “v8 no soportado”, CI verde (H0).
- [ ] `#2` Spike S1: ¿hay protocolo de generadores en v8? (veredicto B vs C).
- [ ] `#3` Spike S2: `contract.json` sample + tabla de mapeo DMMF↔contract.
- [ ] `#4` Spike S3: Pothos vs v8 (issue espejo en `hayes/pothos` si no existe).
- [ ] `#5` Spike S4: decisión Postgres-only para v8 + `docker-compose` ejemplo.
- [ ] `#6` Diseño `SchemaDocument` + `loadContract` (tras #2–#4).
- [ ] `#7` Inputs v8 mínimos (`simple: true`) validados contra ejemplo Postgres.
- [ ] `#8` Plantillas CRUD v8 (`limit`/`offset`, `db.orm.public.*`).
- [ ] `#9` CI dual + release `next` + matriz de compatibilidad.
- [ ] `#10` Guía de migración de usuarios (side-by-side `prisma7`/`prisma`, `baseline/sign/ref`, qué hacer con `_prisma_migrations`).

---

## 9. Comandos de referencia (guía oficial Postgres, RC fijado en el texto citado)

```bash
# Preparar coexistencia (proyectos de usuarios, no este repo aún)
npm uninstall prisma
npm install --save-dev @prisma/prisma7@7.10.0-dev.58
mv prisma.config.ts prisma7.config.ts
# prisma7.config.ts: import { defineConfig } from "@prisma/prisma7/config"

npm install --save-dev prisma@latest
npm install @prisma/orm-postgres
npx prisma --version  # 8.0.0-rc.14 o newer

# Config v8 (prisma.config.ts) — nombres distintos a v7
# definePrismaConfig({ orm: ormConfig({ contract: "prisma8/contract.prisma", output: "generated/prisma8", db: { connection: DATABASE_URL } }) })

npx prisma contract infer --output prisma8/contract.prisma
# editar: borrar modelo PrismaMigrations, añadir @@map("User") etc.
npx prisma contract emit

# Tomar ownership de migraciones (una vez)
npx prisma migration plan --name baseline
npx prisma db sign
npx prisma migration status
npx prisma migration ref set db <timestamp>_baseline

# Loop diario v8
npx prisma contract emit
npx prisma migration plan --name <cambio>
npx prisma db migrate --advance-ref db
npx prisma db verify
```

---

## 10. Referencias

- Guía oficial usada como base: `https://www.prisma.io/docs/guides/upgrade-prisma-orm/postgresql` (+ versión `.md`).
- Ejemplo side-by-side: `https://github.com/prisma/prisma8-and-7-example` (tags `step-0`…`step-3`).
- Docs v8: `/docs/orm` (contrato, `contract emit/infer`), `/docs/cli` (`prisma.config.ts` con `definePrismaConfig`), `/docs/orm/contract-authoring/*` (PSL, `@@map`, tipos, extensiones), changelogs 2026-06 → 2026-08-28 (`prisma@latest` = 8, `prisma@prev` = 7, `take`/`skip` → `limit`/`offset`, `db.sql.raw` → `db.raw.sql`, fin de `@db.*`, exit codes 4/2).
- Pothos: `@pothos/plugin-prisma` (npm, `4.11.0` a la fecha de búsqueda) y `pothos-graphql.dev/docs/plugins/prisma/*` — aún documentan `generator pothos { provider = "prisma-pothos-types" }` + `prisma generate` + `@prisma/client` (v7-only).
- Archivos del repo revisados: `package.json`, `src/generator.ts`, `src/index.ts`, `src/bin.ts`, `src/utils/config.ts`, `src/inputsGenerator/{index.ts,utils/{dmmf,parts,parser,inputFields}.ts}`, `src/crudGenerator/{index.ts,templates/{query,mutation,object,resolver,root}.ts}`, `src/tests/getPrismaSchema.ts`, `examples/inputs-simple-sqlite/{package.json,prisma.config.ts,prisma/schema.prisma}`.

---

## 11. Nota final

Si la pregunta es “¿puedo subir `prisma: ^7.10.0` a `^8` y `bun install`?”, la respuesta es **no**: rompería `generatorHandler`, `getDMMF`, todos los tipos `DMMF.*`, el ejemplo SQLite y el código generado, sin que Pothos ni Prisma 8 ofrezcan hoy un reemplazo drop-in. El camino real es el de arriba: blindar v7, probar el contrato v8 en un spike Postgres, decidir el runtime GraphQL, y recién ahí escribir código.
