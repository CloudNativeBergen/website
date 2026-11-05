// identity: organizer membership mutations (#1923 PR 3). The tenant fields act
// on the envelope's org only; the operator fields (@tag(operator)) take an
// org argument and need a PlatformContext.
import { createGraphQLError } from 'graphql-yoga'
import { builder } from './builder'
import { MemberError, type MemberRole } from './data'
import type { ResolverContext } from './worker'

const refuse = () =>
  createGraphQLError('Not allowed to manage members', {
    extensions: { code: 'FORBIDDEN' },
  })

/** MemberErrors keep their code and fixed message; the rest is a 500. */
async function answer<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (e) {
    if (e instanceof MemberError)
      throw createGraphQLError(e.message, { extensions: { code: e.code } })
    throw e
  }
}

/** The signed-in member's own org from the envelope, never an argument. */
const asMember = (ctx: ResolverContext) => {
  const e = ctx.envelope
  if (e?.typ !== 'tenant' || !e.userId) throw refuse()
  return ctx.data.members().asMember(e.userId, e.orgId)
}

/** Refuses everything but a PlatformContext before any lookup. */
const asOperator = (ctx: ResolverContext, orgId: string) => {
  const e = ctx.envelope
  if (e?.typ !== 'platform') throw refuse()
  return ctx.data.members().asOperator(e.userId, orgId)
}

const Role = builder.enumType('MemberRole', {
  values: ['owner', 'admin', 'member'] as const,
})

const Invitation = builder
  .objectRef<{
    id: string
    role: string | null
    status: string
    expiresAt: Date
  }>('MemberInvitation')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      role: t.exposeString('role', { nullable: true }),
      status: t.exposeString('status'),
      expiresAt: t.string({
        resolve: (i) => new Date(i.expiresAt).toISOString(),
      }),
    }),
  })

builder.mutationType({
  fields: (t) => {
    const orgId = () => t.arg.id({ required: true })
    const email = () => t.arg.string({ required: true })
    const role = () => t.arg({ type: Role, required: true })
    const id = () => t.arg.id({ required: true })
    const op = { tag: 'operator' } as const
    return {
      inviteMember: t.field({
        type: Invitation,
        args: { email: email(), role: role() },
        resolve: (_, a, ctx) =>
          answer(async () =>
            (await asMember(ctx)).invite(a.email, a.role as MemberRole),
          ),
      }),
      cancelInvitation: t.boolean({
        args: { invitationId: id() },
        resolve: (_, a, ctx) =>
          answer(async () => {
            await (await asMember(ctx)).cancelInvitation(String(a.invitationId))
            return true
          }),
      }),
      removeMember: t.boolean({
        args: { userId: id() },
        resolve: (_, a, ctx) =>
          answer(async () => {
            await (await asMember(ctx)).remove(String(a.userId))
            return true
          }),
      }),
      changeMemberRole: t.boolean({
        args: { userId: id(), role: role() },
        resolve: (_, a, ctx) =>
          answer(async () => {
            await (
              await asMember(ctx)
            ).changeRole(String(a.userId), a.role as MemberRole)
            return true
          }),
      }),
      operatorInviteMember: t.field({
        ...op,
        type: Invitation,
        args: { orgId: orgId(), email: email(), role: role() },
        resolve: (_, a, ctx) =>
          answer(async () =>
            (await asOperator(ctx, String(a.orgId))).invite(
              a.email,
              a.role as MemberRole,
            ),
          ),
      }),
      operatorCancelInvitation: t.boolean({
        ...op,
        args: { orgId: orgId(), invitationId: id() },
        resolve: (_, a, ctx) =>
          answer(async () => {
            await (
              await asOperator(ctx, String(a.orgId))
            ).cancelInvitation(String(a.invitationId))
            return true
          }),
      }),
      operatorRemoveMember: t.boolean({
        ...op,
        args: { orgId: orgId(), userId: id() },
        resolve: (_, a, ctx) =>
          answer(async () => {
            await (
              await asOperator(ctx, String(a.orgId))
            ).remove(String(a.userId))
            return true
          }),
      }),
      operatorChangeMemberRole: t.boolean({
        ...op,
        args: { orgId: orgId(), userId: id(), role: role() },
        resolve: (_, a, ctx) =>
          answer(async () => {
            await (
              await asOperator(ctx, String(a.orgId))
            ).changeRole(String(a.userId), a.role as MemberRole)
            return true
          }),
      }),
    }
  },
})

// toSubGraphSchema supplies Query._service.
export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.6',
})
