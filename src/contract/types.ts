/**
 * Minimal structural types for the Prisma 8 data contract artifact
 * (`contract.json` emitted by `prisma contract emit`).
 *
 * Only the parts consumed by the code generator are modeled here.
 * The full generated type lives in the user's `contract.d.ts`.
 */

export interface ContractScalarType {
  kind: string
  codecId: string
}

export interface ContractEnumValueSet {
  entityKind: 'enum'
  entityName: string
  namespaceId: string
  plane: string
}

export interface ContractDomainField {
  nullable: boolean
  type: ContractScalarType
  /** Present when the column is backed by a contract enum (e.g. Role). */
  valueSet?: ContractEnumValueSet
}

export type ContractCardinality = '1:N' | 'N:1' | '1:1'

export interface ContractRelation {
  cardinality: ContractCardinality
  to: { model: string; namespace: string }
  on: { localFields: string[]; targetFields: string[] }
  /** Only present on single-valued relations; absent means non-nullable. */
  nullable?: boolean
}

export interface ContractDomainModel {
  fields: Record<string, ContractDomainField>
  relations?: Record<string, ContractRelation>
  storage?: {
    table: string
    namespaceId: string
    fields: Record<string, { column: string }>
  }
}

export interface ContractEnumMember {
  name: string
  value: string
}

export interface ContractEnumDef {
  codecId: string
  members: ContractEnumMember[]
}

export interface ContractUnique {
  columns: string[]
}

export interface ContractTable {
  columns: Record<string, { codecId: string; nativeType: string; nullable: boolean; default?: unknown }>
  primaryKey?: { columns: string[]; name: string }
  uniques?: ContractUnique[]
  indexes?: unknown[]
  foreignKeys?: unknown[]
}

export interface ContractJson {
  schemaVersion: string
  targetFamily: string
  target: string
  roots: Record<string, { model: string; namespace: string }>
  domain: {
    namespaces: Record<
      string,
      {
        models: Record<string, ContractDomainModel>
        /** Note: the key is `enum` (singular) in the emitted artifact. */
        enum?: Record<string, ContractEnumDef>
      }
    >
  }
  storage: {
    namespaces: Record<
      string,
      {
        entries: {
          table: Record<string, ContractTable>
        }
      }
    >
  }
}
