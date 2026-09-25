// Every operation enabled, with states and tags: create/update/delete are generated and scoped by the runtime
const base = require('./base')

module.exports = base({
  exposure: {
    maxTake: 25,
    operations: { findMany: 'canRead', findFirst: 'canRead', findUnique: 'canRead', count: 'canRead', updateOne: 'canWrite', updateMany: 'canWrite', deleteOne: 'canWrite', deleteMany: 'canWrite' },
    models: {
      User: { fields: { email: 'guarded', phone: ['guarded', 'unfilterable'], role: 'readonly', passwordHash: 'readonly' }, operations: { findMany: 'canRead', findUnique: 'canRead' } },
      Post: { fields: { author: ['guarded', 'readonly'], published: 'readonly' } },
      Comment: { fields: { body: 'guarded' } },
    },
  },
}, { simple: false })
