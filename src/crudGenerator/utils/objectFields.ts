import type { DMMF } from '@prisma/generator-helper'
import type { ConfigInternal } from '../../utils/config'
import { getConfigCrudUnderscore } from '../../utils/configUtils'
import { isGuarded, isHidden } from '../../utils/exposure'
import type { NormalizedExposure } from '../../utils/exposureConfig'
import { escapeQuotesAndMultilineSupport, firstLetterLowerCase, firstLetterUpperCase } from '../../utils/string'
import { useTemplate } from '../../utils/template'
import {
  fieldObjectTemplate,
  guardedFieldObjectTemplate,
  guardedRelationObjectTemplate,
  listRelationObjectTemplate,
  relationObjectTemplate,
} from '../templates/object'
import { getRelationQuery } from './exposure'

export const cleanifyDocumentation = (str?: string) => str?.replace(/\s*@Pothos\.omit\(.*\)\s*/, '')

type ObjectFields = {
  fields: string[]
  exportFields: string[]
  /** Names imported from the runtime by the code of these fields */
  runtimeNames: string[]
  /** A guarded to-one relation is built with a helper of `utils.ts` and reads rows with the Prisma client */
  guardedRelations: boolean
}

export const getObjectFieldsString = (
  modelName: string,
  fields: readonly DMMF.Field[],
  config: ConfigInternal,
  exposure?: NormalizedExposure,
  models: readonly DMMF.Model[] = [],
): ObjectFields =>
  fields.reduce<ObjectFields>(
    (acc, field) => {
      const { fields, exportFields } = acc
      const { isId, type: fieldType, name, relationName, isRequired, documentation, isList } = field

      // Hidden by `crud.exposure`: neither the field nor its `FieldObject` export are generated
      if (isHidden(exposure, modelName, name)) return acc

      const guarded = isGuarded(exposure, modelName, name)
      const nameUpper = firstLetterUpperCase(name)
      const cleanDocumentation = escapeQuotesAndMultilineSupport(cleanifyDocumentation(documentation))
      const description = `${cleanDocumentation}` || 'undefined' // field description defined in schema.prisma
      const nullable = isRequired && !guarded ? 'false' : 'true'
      const type = fieldType === 'BigInt' ? 'Bigint' : fieldType
      const optionalUnderscore = getConfigCrudUnderscore(config)
      const obj = `${modelName}${optionalUnderscore}${nameUpper}${optionalUnderscore}FieldObject`
      const templateOpts = { modelName, name, nameUpper, description, nullable, type, optionalUnderscore }

      // Relation
      if (relationName) {
        if (isList) {
          fields.push(`${name}: t.relation('${name}', ${obj}(t)),`)
          const { query, prelude, runtimeNames } = getRelationQuery(
            exposure,
            { model: modelName, field: name, targetModel: fieldType },
            `${obj}Target`,
          )
          exportFields.push(
            useTemplate(listRelationObjectTemplate, {
              ...templateOpts,
              typeUpper: firstLetterUpperCase(templateOpts.type),
              query,
              prelude,
            }),
          )
          return { ...acc, runtimeNames: [...acc.runtimeNames, ...runtimeNames] }
        }

        if (guarded) {
          // The row of the target is checked by its single-field id
          const targetKey = models.find((m) => m.name === fieldType)?.fields.find((f) => f.isId)?.name ?? 'id'
          fields.push(`${name}: ${obj}(t),`)
          exportFields.push(
            useTemplate(guardedRelationObjectTemplate, {
              ...templateOpts,
              targetKey,
              targetModelLower: firstLetterLowerCase(fieldType),
              prisma: config.crud.prismaCaller,
            }),
          )
          return { ...acc, runtimeNames: [...acc.runtimeNames, 'isRowReadable'], guardedRelations: true }
        }

        fields.push(`${name}: t.relation('${name}', ${obj}),`)
        exportFields.push(useTemplate(relationObjectTemplate, templateOpts))
        return acc
      }

      // Scalar (DateTime, Json, Enums, etc.)
      fields.push(`${name}: t.field(${obj}),`)

      const shouldBeGraphqlId = isId && config.crud.mapIdFieldsToGraphqlId === 'Objects'

      exportFields.push(
        useTemplate(guarded ? guardedFieldObjectTemplate : fieldObjectTemplate, {
          ...templateOpts,
          conditionalType: (() => {
            const type = templateOpts.type
            const isNativeType = ['String', 'Int', 'Float', 'Boolean'].includes(type)
            const importedType = (() => {
              if (shouldBeGraphqlId) return `"ID"`
              return isNativeType ? `"${type}"` : `Inputs.${type}`
            })()
            const bracketify = (str: string) => `[${str}]`
            return isList ? bracketify(importedType) : importedType
          })(),
          conditionalResolve: (() => {
            const name = templateOpts.name
            const value = `parent.${name}`
            const stringParsefy = (str: string) => `String(${str})`
            const final = shouldBeGraphqlId ? stringParsefy(value) : value
            return final
          })(),
        }),
      )
      return guarded ? { ...acc, runtimeNames: [...acc.runtimeNames, 'canReadField'] } : acc
    },
    { fields: [] as string[], exportFields: [] as string[], runtimeNames: [] as string[], guardedRelations: false },
  )
