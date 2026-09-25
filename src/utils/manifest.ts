import fs from 'node:fs'
import path from 'node:path'
import type { DMMF } from '@prisma/generator-helper'
import { isOperationEnabled } from '../crudGenerator/utils/parts'
import type { ConfigInternal } from './config'
import { type NormalizedExposure, OPERATIONS, STATES } from './exposureConfig'

/** What the runtime knows about the schema. Stable: models and fields in the order of the schema, operations in a fixed order */
export type Manifest = {
  version: 1
  generator: string
  models: Record<
    string,
    {
      maxTake?: number
      operations: Record<string, string[]>
      fields: Record<
        string,
        | { kind: 'scalar'; type: string; states: string[]; isList?: true }
        | { kind: 'relation'; targetModel: string; isList: boolean; fromFields: string[]; states: string[] }
      >
    }
  >
}

/** Version of this generator (`dist/package.json` when published, the root one in the repo) */
const generatorVersion = (): string =>
  (JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')) as { version: string }).version

export const buildManifest = (config: ConfigInternal, exposure: NormalizedExposure, dmmf: DMMF.Document): Manifest => ({
  version: 1,
  generator: generatorVersion(),
  models: Object.fromEntries(
    dmmf.datamodel.models
      .filter((model) => exposure.emittedModels.has(model.name))
      .map((model) => {
        const normalized = exposure.models[model.name]
        return [
          model.name,
          {
            ...(normalized?.maxTake === undefined ? {} : { maxTake: normalized.maxTake }),
            operations: Object.fromEntries(
              OPERATIONS.filter((operation) => isOperationEnabled(config, exposure, model.name, operation)).map(
                (operation) => [operation, normalized?.operations[operation] ?? []],
              ),
            ),
            fields: Object.fromEntries(
              model.fields.map((field) => {
                const states = normalized?.fields[field.name]?.states ?? []
                return [
                  field.name,
                  field.kind === 'object'
                    ? {
                        kind: 'relation' as const,
                        targetModel: field.type,
                        isList: field.isList,
                        fromFields: [...(field.relationFromFields ?? [])],
                        states,
                      }
                    : {
                        kind: 'scalar' as const,
                        type: field.type,
                        states,
                        ...(field.isList ? { isList: true as const } : {}),
                      },
                ]
              }),
            ),
          },
        ]
      }),
  ),
})

export const renderManifest = (manifest: Manifest): string => `${JSON.stringify(manifest, null, 2)}\n`

/** `<outputDir>/exposure.ts`: registers the manifest and re-exports what the application needs to configure the runtime */
export const renderExposureFile = (manifest: Manifest): string =>
  `import { registerManifest } from '@wokcito/prisma-generator-pothos-codegen/runtime';

export { assertExposureConfigured, byTag, configureExposure } from '@wokcito/prisma-generator-pothos-codegen/runtime';

registerManifest(${JSON.stringify(manifest, null, 2)});
`

/** `<outputDir>/exposure.types.ts`: `crud.exposure` typed with the models and fields of the schema, for the config file */
export const renderExposureTypes = (dmmf: DMMF.Document): string => {
  const models = dmmf.datamodel.models
    .map(
      (model) =>
        `    ${model.name}?: {\n      fields?: {\n${model.fields
          .map((field) => `        ${field.name}?: ExposureState | ExposureState[];`)
          .join('\n')}\n      };\n      operations?: ExposureOperations;\n      maxTake?: number;\n    };`,
    )
    .join('\n')

  return `export type ExposureState = ${STATES.map((s) => `'${s}'`).join(' | ')};

export type ExposureOperation = ${OPERATIONS.map((o) => `'${o}'`).join(' | ')};

export type ExposureOperations =
  | ExposureOperation[]
  | ({ inherit?: boolean } & Partial<Record<ExposureOperation, boolean | string | string[]>>);

// \`crud.exposure\` with the models and fields of your schema. In pothos.config.js:
//   /** @type {import('./exposure.types').ExposureConfig} */
export type ExposureConfig = {
  operations?: ExposureOperations;
  maxTake?: number;
  manifest?: { path: string };
  keepInputs?: string[];
  models?: {
${models}
  };
};
`
}

/** Lines printed after generating: what uses the default exposure and what deserves a warning. Never fails the generation */
export const getExposureReport = (exposure: NormalizedExposure): string[] => {
  const lines: string[] = []
  const defaults = Object.values(exposure.models)
    .filter((model) => model.usesDefaults)
    .map((model) => model.name)
  if (defaults.length) lines.push(`Models using default exposure: ${defaults.join(', ')}`)
  const skipped = Object.keys(exposure.models).filter((name) => !exposure.emittedModels.has(name))
  if (skipped.length)
    lines.push(`Models not generated (no operations, and no visible relation reaches them): ${skipped.join(', ')}`)
  for (const warning of exposure.warnings) lines.push(`Warning: ${warning}`)
  return lines
}
