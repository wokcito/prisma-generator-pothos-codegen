import type { ContractCardinality, ContractJson } from './types'

export type GraphqlScalar =
  | 'String'
  | 'Int'
  | 'Float'
  | 'Boolean'
  | 'ID'
  | 'DateTime'
  | 'Decimal'
  | 'BigInt'
  | 'Json'
  | 'Bytes'

export interface ContractScalarField {
  name: string
  codecId: string
  nullable: boolean
  graphqlScalar: GraphqlScalar
  /** Set when the column is backed by a contract enum (e.g. Role). */
  enumName?: string
  /** True when the storage column declares a default (autoincrement(), now(), ...). */
  hasDefault: boolean
}

export interface ContractRelation {
  name: string
  targetModel: string
  targetNamespace: string
  cardinality: ContractCardinality
  nullable: boolean
  localFields: string[]
  targetFields: string[]
}

export interface ContractModel {
  name: string
  namespace: string
  table: string
  fields: ContractScalarField[]
  relations: ContractRelation[]
  /** Null when the table has no primary key (identity comes from uniques). */
  primaryKey: string[] | null
  uniques: string[][]
}

export interface ContractEnum {
  name: string
  namespace: string
  members: string[]
}

export interface SchemaModel {
  target: string
  models: ContractModel[]
  enums: ContractEnum[]
}

/**
 * Maps a Prisma 8 codec id (e.g. `pg/text@1`) to the GraphQL scalar used in
 * generated inputs and object types. Throws on unknown codecs so new database
 * types fail loudly instead of generating wrong schemas.
 */
export const codecToGraphqlScalar = (codecId: string): GraphqlScalar => {
  const base = codecId.split('@')[0]?.split('/').pop()

  switch (codecId) {
    case 'pg/text@1':
    case 'sql/text@1':
    case 'pg/varchar@1':
    case 'sql/varchar@1':
    case 'pg/char@1':
    case 'sql/char@1':
      return 'String'
    case 'pg/int@1':
    case 'pg/int2@1':
    case 'pg/int4@1':
    case 'sql/int@1':
      return 'Int'
    case 'pg/int8@1':
    case 'pg/int8number@1':
      return 'BigInt'
    case 'pg/float@1':
    case 'pg/float4@1':
    case 'pg/float8@1':
    case 'sql/float@1':
      return 'Float'
    case 'pg/bool@1':
      return 'Boolean'
    case 'pg/numeric@1':
      return 'Decimal'
    case 'pg/json@1':
      return 'Json'
    case 'pg/bytea@1':
      return 'Bytes'
    default:
      break
  }

  // Temporal codecs come in -temporal (Date) and -string flavors per type.
  if (
    base === 'timestamptz-temporal' ||
    base === 'timestamp-temporal' ||
    base === 'date-temporal' ||
    base === 'time-temporal' ||
    base === 'timestamptz-string' ||
    base === 'timestamp-string' ||
    base === 'date-string' ||
    base === 'time-string' ||
    base === 'timetz'
  ) {
    return 'DateTime'
  }

  throw new Error(
    `Unknown Prisma 8 codec "${codecId}": add a mapping in codecToGraphqlScalar (src/contract/schema.ts).`,
  )
}

/** Reduces a Prisma 8 `contract.json` to the neutral model consumed by the generators. */
export const toSchemaModel = (contract: ContractJson): SchemaModel => {
  const enums: ContractEnum[] = []
  for (const [namespace, ns] of Object.entries(contract.domain.namespaces)) {
    for (const [name, def] of Object.entries(ns.enum ?? {})) {
      enums.push({ name, namespace, members: def.members.map((m) => m.name) })
    }
  }

  const enumByKey = new Map(enums.map((e) => [`${e.namespace}.${e.name}`, e.name]))

  const models: ContractModel[] = []
  for (const [namespace, ns] of Object.entries(contract.domain.namespaces)) {
    const tables = contract.storage.namespaces[namespace]?.entries.table ?? {}
    for (const [name, model] of Object.entries(ns.models)) {
      const tableName = model.storage?.table ?? name
      const table = tables[tableName]

      const fields: ContractScalarField[] = Object.entries(model.fields).map(([fieldName, field]) => {
        const enumName = field.valueSet
          ? enumByKey.get(`${field.valueSet.namespaceId}.${field.valueSet.entityName}`)
          : undefined
        const storageColumn = table?.columns[model.storage?.fields[fieldName]?.column ?? fieldName]
        return {
          name: fieldName,
          codecId: field.type.codecId,
          nullable: field.nullable,
          graphqlScalar: codecToGraphqlScalar(field.type.codecId),
          ...(enumName ? { enumName } : {}),
          hasDefault: storageColumn?.default !== undefined,
        }
      })

      const relations: ContractRelation[] = Object.entries(model.relations ?? {}).map(([relName, rel]) => ({
        name: relName,
        targetModel: rel.to.model,
        targetNamespace: rel.to.namespace,
        cardinality: rel.cardinality,
        nullable: rel.cardinality === '1:N' ? false : (rel.nullable ?? false),
        localFields: rel.on.localFields,
        targetFields: rel.on.targetFields,
      }))

      models.push({
        name,
        namespace,
        table: tableName,
        fields,
        relations,
        primaryKey: table?.primaryKey ? [...table.primaryKey.columns] : null,
        uniques: (table?.uniques ?? []).map((u) => [...u.columns]),
      })
    }
  }

  return { target: contract.target, models, enums }
}
