export type Operation =
  | 'findMany'
  | 'findUnique'
  | 'findFirst'
  | 'count'
  | 'createOne'
  | 'createMany'
  | 'updateOne'
  | 'updateMany'
  | 'upsertOne'
  | 'deleteOne'
  | 'deleteMany'

export type State = 'unfilterable' | 'readonly' | 'guarded' | 'hidden'

/** A Prisma `where` */
export type Where = Record<string, unknown>

/** A root query or mutation */
export type OperationTarget = {
  kind: 'query' | 'mutation'
  model: string
  operation: Operation
  tags: readonly string[]
}

/** A list relation (its rows are scoped) or a to-one relation (its row is readable or not) */
export type RelationTarget = {
  kind: 'relation'
  model: string
  field: string
  targetModel: string
  isList: boolean
}

/** A field of a row, or the whole row when `field` is `null` */
export type FieldTarget = { model: string; field: string | null }

/** Allows or throws: it does not see nor change rows */
export type Guard = (root: unknown, args: any, ctx: any, info?: unknown) => void | Promise<void>

/** A function, or a list of functions that the runtime composes */
export type Slot<F> = F | F[]

export interface ExposureRuntime {
  /** Guards of an operation, run before Prisma. `byTag` builds it from the tags of the config */
  guards?: (target: OperationTarget) => Guard[]
  /** Rows visible (or that can be changed) for the context, as a Prisma `where`. `undefined` does not restrict */
  scope?: Slot<(target: OperationTarget | RelationTarget, ctx: any) => Where | undefined>
  /** Whether a `guarded` field of an already loaded row can be read. Anything but `true` denies */
  fieldAccess?: Slot<(target: FieldTarget, parent: any, ctx: any) => boolean>
  /** `fieldAccess` as a `where`: the rows where the field is readable. Used when a client filters by a `guarded` field */
  fieldScope?: Slot<(target: { model: string; field: string }, ctx: any) => Where | undefined>
}

/** `isList` is only present (and `true`) for scalar lists (`String[]`) */
export type ManifestScalarField = { kind: 'scalar'; type: string; states: State[]; isList?: true }
export type ManifestRelationField = {
  kind: 'relation'
  targetModel: string
  isList: boolean
  fromFields: string[]
  states: State[]
}
export type ManifestField = ManifestScalarField | ManifestRelationField

export type ManifestModel = {
  maxTake?: number
  /** Enabled operations and their tags */
  operations: Partial<Record<Operation, string[]>>
  fields: Record<string, ManifestField>
}

/** What the generator knows about the schema, embedded in the generated `exposure.ts` */
export type ExposureManifest = {
  version: 1
  generator: string
  models: Record<string, ManifestModel>
}

export type OperationsConfigBase =
  | string[]
  | ({ inherit?: boolean } & Partial<Record<Operation, boolean | string | string[]>>)

/** Shape of `crud.exposure` in `pothos.config.js` (the generated `exposure.types.ts` narrows it to your models and fields) */
export type ExposureConfigBase = {
  operations?: OperationsConfigBase
  maxTake?: number
  manifest?: { path: string }
  models?: Record<
    string,
    { fields?: Record<string, State | State[]>; operations?: OperationsConfigBase; maxTake?: number }
  >
}
