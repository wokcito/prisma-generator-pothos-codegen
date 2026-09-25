// TODO only import what is necessary
export const objectTemplate = `#{inputsImporter}#{resolverImports}#{builderCalculatedImport}#{runtimeImports}
import {
  definePrismaObject,
  defineFieldObject,
  defineRelationFunction,
  defineRelationObject,
#{guardedUtils}} from '../utils';

export const #{modelName}#{optionalUnderscore}Object = definePrismaObject('#{modelName}', {
  description: #{description},
  findUnique: #{findUnique},
  fields: (t) => ({
    #{fields}
  }),
});

#{exportFields}
`

export const fieldObjectTemplate = `export const #{modelName}#{optionalUnderscore}#{nameUpper}#{optionalUnderscore}FieldObject = defineFieldObject('#{modelName}', {
  type: #{conditionalType},
  description: #{description},
  nullable: #{nullable},
  resolve: (parent) => #{conditionalResolve},
});`

/** `guarded` scalar: always nullable, it is only returned when the runtime says the row allows it */
export const guardedFieldObjectTemplate = `export const #{modelName}#{optionalUnderscore}#{nameUpper}#{optionalUnderscore}FieldObject = defineFieldObject('#{modelName}', {
  type: #{conditionalType},
  description: #{description},
  nullable: true,
  resolve: (parent, _args, ctx) => (canReadField({ model: '#{modelName}', field: '#{name}' }, parent, ctx) ? #{conditionalResolve} : null),
});`

/**
 * `guarded` to-one relation. Prisma does not accept a `where` on it, so the row is loaded with its parent and checked
 * afterwards against the scope of its model: the relation is nullable and is null for the rows that scope hides
 */
export const guardedRelationObjectTemplate = `export const #{modelName}#{optionalUnderscore}#{nameUpper}#{optionalUnderscore}FieldObject = defineGuardedRelationObject('#{modelName}', '#{name}', '#{type}', {
  description: #{description},
  isReadable: (row, _context) =>
    isRowReadable(
      { kind: 'relation', model: '#{modelName}', field: '#{name}', targetModel: '#{type}', isList: false },
      row,
      _context,
      { key: '#{targetKey}', find: (where) => #{prisma}.#{targetModelLower}.findMany({ where, select: { #{targetKey}: true } }) },
    ),
});`

export const listRelationObjectTemplate = `#{prelude}export const #{modelName}#{optionalUnderscore}#{nameUpper}#{optionalUnderscore}FieldArgs = builder.args((t) => ({
  where: t.field({ type: Inputs.#{type}WhereInput, required: false }),
  orderBy: t.field({ type: [Inputs.#{type}OrderByWithRelationInput], required: false }),
  cursor: t.field({ type: Inputs.#{type}WhereUniqueInput, required: false }),
  take: t.field({ type: 'Int', required: false }),
  skip: t.field({ type: 'Int', required: false }),
  distinct: t.field({ type: [Inputs.#{typeUpper}ScalarFieldEnum], required: false }),
}))

export const #{modelName}#{optionalUnderscore}#{nameUpper}#{optionalUnderscore}FieldObject = defineRelationFunction('#{modelName}', (t) =>
  defineRelationObject('#{modelName}', '#{name}', {
    description: #{description},
    nullable: #{nullable},
    args: #{modelName}#{optionalUnderscore}#{nameUpper}#{optionalUnderscore}FieldArgs,
    query: #{query},
  }),
);`

export const relationObjectTemplate = `export const #{modelName}#{optionalUnderscore}#{nameUpper}#{optionalUnderscore}FieldObject = defineRelationObject('#{modelName}', '#{name}', {
  description: #{description},
  nullable: #{nullable},
  args: undefined,
  query: undefined,
});`
