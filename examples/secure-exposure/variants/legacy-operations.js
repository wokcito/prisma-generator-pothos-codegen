// Without exposure.operations the excludeResolvers* options keep working, and the manifest lists what is generated
module.exports = require('./base')({
  excludeResolversContain: ['AuditLog', 'upsertOne'],
  exposure: { maxTake: 5, models: { User: { fields: { email: 'guarded', role: 'readonly' } } } },
})
