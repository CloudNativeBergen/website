import { createGraphQLError } from 'graphql-yoga'
import { builder } from './builder'
import type { ConferenceParityDrift } from './data/job-status'
import type { ResolverContext } from './worker'

const Drift = builder
  .objectRef<ConferenceParityDrift>('ConferenceParityDrift')
  .implement({
    fields: (t) => ({
      conferenceId: t.exposeID('conferenceId', { nullable: false }),
      fields: t.exposeStringList('fields', { nullable: false }),
    }),
  })

const Status = builder
  .objectRef<
    NonNullable<
      Awaited<ReturnType<ResolverContext['data']['conferenceParityStatus']>>
    >
  >('ConferenceParityStatus')
  .implement({
    fields: (t) => ({
      ranAt: t.exposeString('ranAt', { nullable: false }),
      status: t.exposeString('status', { nullable: false }),
      checked: t.exposeInt('checked', { nullable: true }),
      affected: t.exposeInt('affected', { nullable: true }),
      drifted: t.field({
        type: [Drift],
        nullable: false,
        resolve: (s) => s.drifted,
      }),
    }),
  })

export function registerJobStatus() {
  builder.queryField('conferenceParityStatus', (t) =>
    t.field({
      type: Status,
      nullable: true,
      tag: 'operator',
      description:
        'Platform operators only. The latest daily D1 vs Sanity parity sweep: status ok, drift or unknown (a failed read). Null if the sweep has never run in this environment.',
      resolve: (_, __, ctx) => {
        if (ctx.envelope?.typ !== 'platform')
          throw createGraphQLError('parity status requires a PlatformContext', {
            extensions: { code: 'FORBIDDEN' },
          })
        return ctx.data.conferenceParityStatus()
      },
    }),
  )
}
