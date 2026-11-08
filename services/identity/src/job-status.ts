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

const MemberAuthority = builder
  .objectRef<{ identitySource: boolean; role: string | null }>(
    'MemberAuthority',
  )
  .implement({
    fields: (t) => ({
      identitySource: t.exposeBoolean('identitySource', {
        description:
          "True when identity owns this org's roles (#2101): the site reads its organizers from here, not Sanity.",
      }),
      role: t.exposeString('role', {
        nullable: true,
        description:
          "The caller's live org role from the gateway envelope; null without a signed-in user or membership.",
      }),
    }),
  })

builder.queryField('memberAuthority', (t) =>
  t.field({
    type: MemberAuthority,
    nullable: true,
    description:
      "The session org's member source and the caller's live role (#2101). Null outside a tenant envelope.",
    resolve: async (_, __, ctx) => {
      const e = ctx.envelope
      if (e?.typ !== 'tenant') return null
      return {
        identitySource: await ctx.data.isIdentitySource(e.orgId),
        role: e.userId ? e.orgRole : null,
      }
    },
  }),
)

builder.mutationField('setMemberSource', (t) =>
  t.boolean({
    tag: 'operator',
    description:
      "Platform operators only (#2101). identity: true makes identity the source of the org's roles: the hourly sync stops granting and the site reads organizers from identity. Refused unless the latest member sync (under two hours old, not failed) reported no access drift for the org. identity: false rolls back. Audited.",
    args: {
      orgId: t.arg.id({ required: true }),
      identity: t.arg.boolean({ required: true }),
    },
    resolve: async (_, a, ctx) => {
      const e = ctx.envelope
      // Refuse before any read: no existence oracle for non-operators.
      if (e?.typ !== 'platform')
        throw createGraphQLError('setMemberSource requires a PlatformContext', {
          extensions: { code: 'FORBIDDEN' },
        })
      const refusal = await ctx.data.setMemberSource(
        String(a.orgId),
        a.identity,
        e.userId,
      )
      if (refusal)
        throw createGraphQLError(refusal, {
          extensions: { code: 'FAILED_PRECONDITION' },
        })
      return true
    },
  }),
)
