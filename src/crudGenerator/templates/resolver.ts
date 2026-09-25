import { useTemplate } from '../../utils/template'

export const makeResolver = (
  root: 'Query' | 'Mutation',
  imports: string,
  operation: string,
  type: string,
  nullable: 'true' | 'false',
  args: string,
  resolve: string,
  isPrisma = true,
) =>
  useTemplate(
    resolverTemplate,
    {
      root,
      object: isPrisma ? 'PrismaObject' : 'Object',
      imports,
      operation,
      type,
      nullable,
      args,
      resolve,
      field: isPrisma ? 'prismaField' : 'field',
    },
    [
      'modelName',
      'inputsImporter',
      'resolverImports',
      'builderCalculatedImport',
      'objectOpen',
      'objectClose',
      'runtimeImports',
    ],
  )

// `objectOpen`/`objectClose` are filled at write time (see `getResolverVariables`): by default the object is returned
// as is, and with `crud.exposure` the guards wrap its `resolve` once the object is fully typed
export const resolverTemplate = `#{inputsImporter}#{imports}#{resolverImports}#{builderCalculatedImport}#{runtimeImports}
import { define#{root}, define#{root}Function, define#{root}#{object} } from '../../utils';

export const #{operation}#{modelName}#{root}Args = builder.args((t) => (#{args}))

export const #{operation}#{modelName}#{root}Object = define#{root}Function((t)#{objectOpen}define#{root}#{object}({
    type: #{type},
    nullable: #{nullable},
    args: #{operation}#{modelName}#{root}Args,
    resolve: #{resolve},
  })#{objectClose},
);

export const #{operation}#{modelName}#{root} = define#{root}((t) => ({
  #{operation}#{modelName}: t.#{field}(#{operation}#{modelName}#{root}Object(t)),
}));
`
