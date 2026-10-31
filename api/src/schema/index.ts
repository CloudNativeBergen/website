import { builder } from './builder'

builder.queryType({
  fields: (t) => ({
    health: t.string({
      description: 'Liveness check. Always "ok" when the Worker is serving.',
      resolve: () => 'ok',
    }),
  }),
})

export const schema = builder.toSchema()
