import type { DMMF } from '@prisma/generator-helper'
import type { ConfigInternal } from '../../utils/config'
import type { NormalizedExposure } from '../../utils/exposureConfig'
import { mutations as MutationTemplates } from '../templates/mutation'
import { queries as QueryTemplates } from '../templates/query'
import { type GeneratedResolver, writeIndex, writeObject, writeResolvers } from './parts'

/**
 * @returns List of generated resolvers
 */
export async function generateModel(
  config: ConfigInternal,
  dmmf: DMMF.Document,
  modelName: string,
  exposure?: NormalizedExposure,
): Promise<{ resolvers: GeneratedResolver[]; index: Awaited<ReturnType<typeof writeIndex>> }> {
  const model = dmmf.datamodel.models.find((m) => m.name === modelName)
  if (!model) return { index: [], resolvers: [] }

  await writeObject(config, model, exposure, dmmf.datamodel.models)
  const queries = await writeResolvers(config, model, 'queries', QueryTemplates, exposure)
  const mutations = await writeResolvers(config, model, 'mutations', MutationTemplates, exposure)
  const index = await writeIndex(config, model, { queries, mutations }, exposure)

  return { resolvers: [...queries, ...mutations], index }
}
