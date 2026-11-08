// identity: organizer membership mutations (#1923 PR 3). The tenant fields act
// on the envelope's org only; the operator fields (@tag(operator)) take an
// org argument and need a PlatformContext.
import { createGraphQLError } from 'graphql-yoga'
import { can, principalOf } from '@runkonf/tenancy'
import { builder } from './builder'
import './job-status'
import { MemberError, type MemberRole } from './data'
import { VISIBILITIES, type Profile } from './data/speaker-profiles'
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

const RevokeAllResult = builder
  .objectRef<{
    membersRemoved: number
    sessionsRevoked: number
    keptLastOwnerOf: string[]
  }>('RevokeAllResult')
  .implement({
    fields: (t) => ({
      membersRemoved: t.exposeInt('membersRemoved'),
      sessionsRevoked: t.exposeInt('sessionsRevoked'),
      keptLastOwnerOf: t.exposeIDList('keptLastOwnerOf'),
    }),
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
const reader = (ctx: ResolverContext) => {
  const e = ctx.envelope
  if (e?.typ !== 'tenant') return null
  const p = principalOf(e)
  if (!can(p, 'org.read_settings')) return null
  return { orgId: e.orgId, manager: can(p, 'org.manage_members') }
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
      revokeAll: t.field({
        ...op,
        type: RevokeAllResult,
        description:
          "Emergency revocation: removes the user's memberships (except where they are an org's last owner, reported in keptLastOwnerOf), sessions and operator flag, audited. Platform operators only. An issued identity JWT lives up to 300 s more.",
        args: { userId: id() },
        resolve: (_, a, ctx) =>
          answer(() =>
            ctx.data.members().revokeAll(ctx.envelope, String(a.userId)),
          ),
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

const Visibility = builder.enumType('ProfileVisibility', {
  values: VISIBILITIES,
})

const SpeakerProfile = builder.objectRef<Profile>('SpeakerProfile').implement({
  description:
    'A global speaker profile (#2093). Carries an opaque id, never the user id or email.',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    bio: t.exposeString('bio'),
    photoKey: t.exposeString('photoKey', {
      nullable: true,
      description:
        'R2 object key of the photo (letters, digits, / _ . -; no URL). Upload is a follow-up.',
    }),
    links: t.exposeStringList('links'),
    topics: t.exposeStringList('topics'),
    visibility: t.field({ type: Visibility, resolve: (p) => p.visibility }),
    updatedAt: t.string({
      resolve: (p) => new Date(p.updatedAt).toISOString(),
    }),
  }),
})

const SpeakerDirectoryPage = builder
  .objectRef<{
    nodes: Profile[]
    endCursor: string | null
    hasNextPage: boolean
  }>('SpeakerDirectoryPage')
  .implement({
    fields: (t) => ({
      nodes: t.field({ type: [SpeakerProfile], resolve: (p) => p.nodes }),
      endCursor: t.exposeString('endCursor', { nullable: true }),
      hasNextPage: t.exposeBoolean('hasNextPage'),
    }),
  })

const SpeakerProfileInput = builder.inputType('SpeakerProfileInput', {
  description:
    'Omitted fields keep their stored value. name is required on create.',
  fields: (t) => ({
    name: t.string(),
    bio: t.string(),
    photoKey: t.string(),
    links: t.stringList(),
    topics: t.stringList(),
    visibility: t.field({ type: Visibility }),
  }),
})

/**
 * Organizers (#2093, owner decision), decided from the envelope before any
 * lookup: an owner or admin of the tenant org, an operator acting for the
 * tenant, or a PlatformContext operator. Plain members are not organizers.
 */
const isOrganizer = (ctx: ResolverContext) =>
  can(principalOf(ctx.envelope), 'speaker_directory.read')

builder.queryFields((t) => ({
  myProfile: t.field({
    type: SpeakerProfile,
    nullable: true,
    description:
      "The session user's speaker profile; null until first update, and null without a session user.",
    resolve: (_, __, ctx) => {
      const id = ctx.envelope?.userId
      return id ? ctx.data.speakerProfiles().mine(id) : null
    },
  }),
  speakerDirectory: t.field({
    type: SpeakerDirectoryPage,
    nullable: true,
    description:
      'Network and public speaker profiles, for organizers only; null for anyone else. Never private profiles, user ids or emails.',
    args: {
      first: t.arg.int({ defaultValue: 50 }),
      after: t.arg.string(),
      query: t.arg.string(),
    },
    resolve: (_, a, ctx) =>
      isOrganizer(ctx)
        ? ctx.data.speakerProfiles().directory(a.first ?? 50, a.after, a.query)
        : null,
  }),
}))

builder.mutationFields((t) => ({
  updateMyProfile: t.field({
    type: SpeakerProfile,
    description:
      "Creates or updates the session user's speaker profile. New profiles default to network visibility.",
    args: { input: t.arg({ type: SpeakerProfileInput, required: true }) },
    resolve: (_, a, ctx) =>
      answer(() =>
        ctx.data.speakerProfiles().update(sessionUser(ctx), a.input),
      ),
  }),
}))

// toSubGraphSchema supplies Query._service.
export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.6',
})
