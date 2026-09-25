const base = require('../src/schema/configs.js')

/** The config of the example with some crud/inputs options changed */
module.exports = (crud = {}, inputs = {}) => ({
  ...base,
  crud: { ...base.crud, ...crud },
  inputs: { ...base.inputs, ...inputs },
})
