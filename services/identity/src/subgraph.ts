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

/**
 * Who reads the session org's members (#1972), decided from the envelope
 * alone, before any lookup: a member with any role, or an operator acting for
 * the tenant (OPERATOR_SCOPE). Emails and invitations: owner, admin, operator.
 * Anyone else gets null.
 */
const OPERATOR_SCOPE = 'platform:operator'
const reader = (ctx: ResolverContext) => {
  const e = ctx.envelope
  if (e?.typ !== 'tenant' || !e.userId) return null
  const operator = e.scopes.includes(OPERATOR_SCOPE)
  const roles = (e.orgRole ?? '').split(',').map((r) => r.trim().toLowerCase())
  if (!operator && !roles.some((r) => r)) return null
  const manager = operator || roles.some((r) => r === 'owner' || r === 'admin')
  return { orgId: e.orgId, manager }
}

const Member = builder
  .objectRef<{
    userId: string
    name: string
    role: string
    joinedAt: Date
    email: string | null
    providers: string[]
  }>('OrganizationMember')
  .implement({
    fields: (t) => ({
      userId: t.exposeID('userId'),
      name: t.exposeString('name'),
      role: t.exposeString('role'),
      joinedAt: t.string({
        resolve: (m) => new Date(m.joinedAt).toISOString(),
      }),
      email: t.exposeString('email', {
        nullable: true,
        description: 'Owners, admins and operators only; null otherwise.',
      }),
      providers: t.exposeStringList('providers', {
        description:
          'Linked sign-in provider names, sorted. Owners, admins and operators only; empty otherwise.',
      }),
    }),
  })

const PendingInvitation = builder
  .objectRef<{
    id: string
    email: string
    role: string | null
    expiresAt: Date
  }>('PendingInvitation')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      email: t.exposeString('email'),
      role: t.exposeString('role', { nullable: true }),
      expiresAt: t.string({
        resolve: (i) => new Date(i.expiresAt).toISOString(),
      }),
    }),
  })

builder.queryType({
  fields: (t) => ({
    members: t.field({
      type: [Member],
      nullable: true,
      description:
        "The session org's members. Null unless the caller is a member or an operator acting for the tenant.",
      resolve: (_, __, ctx) => {
        const r = reader(ctx)
        return r ? ctx.data.members().list(r.orgId, r.manager) : null
      },
    }),
    invitations: t.field({
      type: [PendingInvitation],
      nullable: true,
      description:
        "The session org's pending invitations. Owners, admins and operators only; null otherwise.",
      resolve: (_, __, ctx) => {
        const r = reader(ctx)
        return r?.manager
          ? ctx.data.members().pendingInvitations(r.orgId)
          : null
      },
    }),
  }),
})

const PushKeys = builder.inputType('PushSubscriptionKeys', {
  fields: (t) => ({
    p256dh: t.string({ required: true }),
    auth: t.string({ required: true }),
  }),
})
const PushSubscriptionInput = builder.inputType('PushSubscriptionInput', {
  fields: (t) => ({
    endpoint: t.string({ required: true }),
    keys: t.field({ type: PushKeys, required: true }),
  }),
})

/** The session user from the envelope, never an argument (kontroll#61). */
const sessionUser = (ctx: ResolverContext) => {
  const id = ctx.envelope?.userId
  if (!id) throw refuse()
  return id
}

builder.mutationType({
  fields: (t) => {
    const orgId = () => t.arg.id({ required: true })
    const email = () => t.arg.string({ required: true })
    const role = () => t.arg({ type: Role, required: true })
    const id = () => t.arg.id({ required: true })
    const op = { tag: 'operator' } as const
    return {
      subscribePush: t.boolean({
        description:
          'Stores a web push subscription for the session user. An endpoint another user held moves to the caller.',
        args: { input: t.arg({ type: PushSubscriptionInput, required: true }) },
        resolve: (_, a, ctx) =>
          answer(async () => {
            await ctx.data
              .pushSubscriptions()
              .subscribe(sessionUser(ctx), a.input)
            return true
          }),
      }),
      unsubscribePush: t.boolean({
        description:
          "Removes the session user's subscription for the endpoint.",
        args: { endpoint: t.arg.string({ required: true }) },
        resolve: (_, a, ctx) =>
          ctx.data
            .pushSubscriptions()
            .unsubscribe(sessionUser(ctx), a.endpoint),
      }),
      prunePushSubscriptions: t.int({
        ...op,
        description:
          'Deletes endpoints the push service answered 404 or 410 for. Platform context only.',
        args: { endpoints: t.arg.stringList({ required: true }) },
        resolve: (_, a, ctx) => {
          if (ctx.envelope?.typ !== 'platform') throw refuse()
          return answer(() => ctx.data.pushSubscriptions().prune(a.endpoints))
        },
      }),
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
