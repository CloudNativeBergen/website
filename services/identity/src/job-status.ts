import { createGraphQLError } from 'graphql-yoga'
import { builder } from './builder'
import type { JobStatusRow, MemberSyncDrift } from './data/job-status'

const Drift = builder.objectRef<MemberSyncDrift>('MemberSyncDrift').implement({
  fields: (t) => ({
    orgId: t.exposeID('orgId', { nullable: false }),
    missingInIdentity: t.int({
      nullable: false,
      resolve: (d) => d.counts.missingInIdentity,
    }),
    missingInSanity: t.int({
      nullable: false,
      resolve: (d) => d.counts.missingInSanity,
    }),
    roleMismatch: t.int({
      nullable: false,
      resolve: (d) => d.counts.roleMismatch,
    }),
    ownersBelowTwo: t.int({
      nullable: true,
      resolve: (d) => d.counts.ownersBelowTwo,
    }),
    invitePending: t.int({
      nullable: false,
      description:
        'Of missingInIdentity, how many have a pending, unexpired invitation.',
      resolve: (d) => d.counts.invitePending ?? 0,
    }),
  }),
})
const Status = builder.objectRef<JobStatusRow>('MemberSyncStatus').implement({
  fields: (t) => ({
    ranAt: t.string({
      nullable: false,
      resolve: (r) => new Date(r.ran_at).toISOString(),
    }),
    status: t.exposeString('status', { nullable: false }),
    checked: t.exposeInt('checked', { nullable: true }),
    affected: t.exposeInt('affected', { nullable: true }),
    granted: t.exposeInt('granted', { nullable: true }),
    drifted: t.field({
      type: [Drift],
      nullable: false,
      resolve: (r): MemberSyncDrift[] => JSON.parse(r.detail ?? '[]'),
    }),
  }),
})
builder.queryField('memberSyncStatus', (t) =>
  t.field({
    type: Status,
    nullable: true,
    tag: 'operator',
    description:
      'Platform operators only. The latest hourly member sync: status ok, drift or failed (failed wins over drift). Null if it has never run in this environment.',
    resolve: (_, __, ctx) => {
      if (ctx.envelope?.typ !== 'platform')
        throw createGraphQLError(
          'member sync status requires a PlatformContext',
          {
            extensions: { code: 'FORBIDDEN' },
          },
        )
      return ctx.data.memberSyncStatus()
    },
  }),
)
