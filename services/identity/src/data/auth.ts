// The Better Auth instance. Lives in the data layer because it holds the raw
// D1 handle; nothing outside src/data/ gets that handle back.
import { betterAuth } from 'better-auth'
import {
  defineRequestState,
  tryGetCurrentAuthEndpointContext,
} from '@better-auth/core/context'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, jwt, organization } from 'better-auth/plugins'
import { and, count, eq, gt, lte, sql } from 'drizzle-orm'
import { parseOrgRoles } from '@runkonf/tenancy'
import { rawDb } from './db'
import { deliverInvitation, type MailEnv } from './invitations'
import { emit } from './push'
import * as schema from './schema'

/** Per environment (`wrangler secret put`); preview never gets production values. */
export interface AuthEnv {
  BETTER_AUTH_URL: string
  /**
   * The identity JWT `iss`. Must equal the gateway's IDENTITY_ISSUER
   * (api/wrangler.jsonc): https://id.konf.app in production.
   */
  IDENTITY_ISSUER: string
  BETTER_AUTH_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  LINKEDIN_CLIENT_ID: string
  LINKEDIN_CLIENT_SECRET: string
  RESEND_API_KEY?: MailEnv['RESEND_API_KEY']
  INVITE_FROM?: MailEnv['INVITE_FROM']
  INVITE_DAILY_CAP?: MailEnv['INVITE_DAILY_CAP']
}

/** Security requirement 4: identity JWTs live 5 minutes or less. */
export const JWT_TTL_SECONDS = 300
export const JWT_AUDIENCE = 'konf-gateway'

/** Invitations live 30 days (#1923); the owner can cancel them sooner. */
export const INVITATION_EXPIRES_IN = 30 * 24 * 3600

export const isOwner = (role: string | null | undefined) =>
  parseOrgRoles(role).has('owner')

/** The pending invitation a `resend: true` invite refreshes, if any. */
const resendOf = defineRequestState<{ id: string; actor: string } | undefined>(
  () => undefined,
)

/**
 * The session an in-process `auth.api` call runs as (src/data/members.ts).
 * Request state, so only calls made inside that request see it; an HTTP
 * request through `handler` starts with its own empty state.
 */
export const actAs = defineRequestState<
  { user: unknown; session: unknown } | undefined
>(() => undefined)

export function createAuth(d1: D1Database, env: AuthEnv) {
  const db = rawDb(d1)
  const audit = (action: string, userId: string, providerId?: string) =>
    db.insert(schema.auditEvent).values({ action, userId, providerId })
  // Membership audit (#1923): ids only, never emails (#1310). The actor is
  // the session user; an invite has no subject user yet, so its row is the
  // actor's.
  const actorId = () =>
    tryGetCurrentAuthEndpointContext()?.context.session?.user.id
  const auditMember = (
    action: string,
    userId: string,
    detail: Record<string, string | undefined>,
  ) =>
    db.insert(schema.auditEvent).values({
      action,
      userId,
      detail: JSON.stringify({ actorId: actorId(), ...detail }),
    })

  // #2150: a demo seed user never logs in. Every sign-in and handoff ends in
  // a session or an account write, so refusing both here closes them all,
  // whatever the org's kind is now.
  const refuseSeed = async (userId: string) => {
    const [u] = await db
      .select({ isSeed: schema.user.isSeed })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
    if (u?.isSeed)
      throw new APIError('FORBIDDEN', {
        message: 'This account cannot sign in',
      })
  }

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    telemetry: { enabled: false },
    // OAuth failures land on our page (src/error-page.ts), not Better Auth's.
    onAPIError: { errorURL: `${env.BETTER_AUTH_URL}/error` },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
      // Maps email_verified to emailVerified (false when absent), so an
      // unverified LinkedIn email never links (#807).
      linkedin: {
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
      },
    },
    account: {
      // #807: a sign-in joins an existing user on its provider account id, or
      // on an email both the provider and our record hold as verified. No
      // provider is trusted to skip that check.
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
      },
    },
    session: {
      additionalFields: {
        // Set by the handoff only (src/handoff.ts), never by a client.
        origin: { type: 'string', required: false, input: false },
      },
    },
    user: {
      additionalFields: {
        platformOperator: {
          type: 'boolean',
          defaultValue: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (a) => {
            await refuseSeed(a.userId)
          },
          after: async (a) => {
            // First account of a user is a sign-up; any later one is a link.
            const [{ n }] = await db
              .select({ n: count() })
              .from(schema.account)
              .where(eq(schema.account.userId, a.userId))
            const action = n > 1 ? 'account.linked' : 'account.created'
            await audit(action, a.userId, a.providerId)
          },
        },
        // Unlink (#1981; /unlink-account refuses the last account itself).
        delete: {
          after: async (a) => {
            await audit('account.unlinked', a.userId, a.providerId)
          },
        },
      },
      session: {
        create: {
          before: async (s) => {
            await refuseSeed(s.userId)
          },
          after: async (s) => {
            await audit('session.created', s.userId)
          },
        },
      },
    },
    hooks: {
      // `resend: true` refreshes a pending invitation and returns before any
      // organization hook runs, checking only the role in the body. Apply the
      // owner rule to the stored invitation here instead (#1941).
      before: createAuthMiddleware(async (ctx) => {
        const actor = await actAs.get()
        if (actor) ctx.context.session = actor as never
        // Linking follows the sign-in rule (#807, #1981): it joins only onto a
        // local email we hold as verified. Better Auth checks the provider
        // side (verified, same email, not another user's account) itself.
        if (ctx.path === '/link-social') {
          const session = await getSessionFromCtx(ctx)
          if (!session) throw new APIError('UNAUTHORIZED')
          if (!session.user.emailVerified)
            throw new APIError('FORBIDDEN', {
              message: 'Verify your email before linking another account',
            })
          return
        }
        if (ctx.path !== '/organization/invite-member' || !ctx.body?.resend)
          return
        // Fail closed: every early exit refuses rather than skipping the check.
        const session = await getSessionFromCtx(ctx)
        if (!session) throw new APIError('UNAUTHORIZED')
        // Resolve the org and the row exactly as the plugin does: `||`, not
        // `??`, so an empty organizationId falls back to the active org here
        // too, and expired invitations are ignored (#1941).
        const orgId: string | undefined =
          ctx.body.organizationId || session.session.activeOrganizationId
        const email = String(ctx.body.email ?? '').toLowerCase()
        if (!orgId || !email)
          throw new APIError('FORBIDDEN', {
            message: 'A resend needs an organization and an email',
          })
        // Guard before fetch: a non-member must not reach the invite lookup,
        // or the refusal it gets would reveal whether a pending owner invite
        // exists for that email. Return and let the plugin refuse as usual.
        const [m] = await db
          .select({ role: schema.member.role })
          .from(schema.member)
          .where(
            and(
              eq(schema.member.organizationId, orgId),
              eq(schema.member.userId, session.user.id),
            ),
          )
        if (!m) return
        const [inv] = await db
          .select({ id: schema.invitation.id, role: schema.invitation.role })
          .from(schema.invitation)
          .where(
            and(
              eq(schema.invitation.organizationId, orgId),
              eq(sql`lower(${schema.invitation.email})`, email),
              eq(schema.invitation.status, 'pending'),
              gt(schema.invitation.expiresAt, new Date()),
            ),
          )
        if (!inv) return // no pending invite: a normal create, hooks run
        if (isOwner(inv.role) && !isOwner(m.role))
          throw new APIError('FORBIDDEN', {
            message: 'Only an owner can resend an owner invitation',
          })
        await resendOf.set({ id: inv.id, actor: session.user.id })
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/organization/invite-member') {
          const s = await resendOf.get()
          const r = ctx.context.returned as
            { id?: string; organizationId?: string } | undefined
          if (s && r?.id === s.id)
            await db.insert(schema.auditEvent).values({
              action: 'invite.resend',
              userId: s.actor,
              detail: JSON.stringify({
                actorId: s.actor,
                orgId: r.organizationId,
                invitationId: s.id,
              }),
            })
          return
        }
        // `leave` runs no organization hook; audit it from the route.
        if (ctx.path !== '/organization/leave') return
        const m = ctx.context.returned as
          { id: string; userId: string; organizationId: string } | undefined
        if (m?.id)
          await auditMember('member.leave', m.userId, {
            actorId: m.userId, // leave is always the member themselves
            orgId: m.organizationId,
            memberId: m.id,
          })
      }),
    },
    plugins: [
      jwt({
        jwks: { keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' } },
        jwt: {
          issuer: env.IDENTITY_ISSUER,
          audience: JWT_AUDIENCE,
          expirationTime: `${JWT_TTL_SECONDS}s`,
          // sub (the user id) and the handoff origin, which the gateway
          // matches against the request's tenant (#1844). orgRole and the
          // operator flag come from the live lookup, never from a claim.
          definePayload: ({ session }) => ({ origin: session.origin }),
        },
      }),
      // Organizations are provisioned by operators through the directory,
      // not created by users.
      organization({
        allowUserToCreateOrganization: false,
        requireEmailVerificationOnInvitation: true,
        invitationExpiresIn: INVITATION_EXPIRES_IN,
        // #2130: the invitee gets a link to /invite/<id> (src/invite-page.ts).
        sendInvitationEmail: ({ id, email, organization: o, inviter }) =>
          deliverInvitation(env, d1, {
            invitationId: id,
            orgId: o.id,
            email,
            orgName: o.name,
            orgSlug: o.slug,
            inviterName: inviter.user.name,
            inviterEmail: inviter.user.emailVerified
              ? inviter.user.email
              : null,
          }).then(() => undefined),
        disableOrganizationDeletion: true,
        // Role rules (#1923): the plugin already lets admins manage admins
        // and keeps owners (invite, role change, removal) to owners. The one
        // gap, cancelling an owner invitation, is closed below. The last
        // owner is guarded by a trigger (migrations/0003).
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation: i }) => {
            // An expired invitation stays `pending` in the table, and the
            // unique pending index would refuse a fresh one: retire it.
            await db
              .update(schema.invitation)
              .set({ status: 'canceled' })
              .where(
                and(
                  eq(schema.invitation.organizationId, i.organizationId),
                  eq(
                    sql`lower(${schema.invitation.email})`,
                    i.email.toLowerCase(),
                  ),
                  eq(schema.invitation.status, 'pending'),
                  lte(schema.invitation.expiresAt, new Date()),
                ),
              )
          },
          afterCreateInvitation: async ({ invitation: i, inviter }) => {
            await auditMember('invite.create', inviter.id, {
              orgId: i.organizationId,
              invitationId: i.id,
              to: i.role ?? undefined,
            })
          },
          beforeCancelInvitation: async ({ invitation: i, cancelledBy }) => {
            if (i.status !== 'pending')
              throw new APIError('BAD_REQUEST', {
                message: 'Only a pending invitation can be cancelled',
              })
            if (!isOwner(i.role)) return
            const [m] = await db
              .select({ role: schema.member.role })
              .from(schema.member)
              .where(
                and(
                  eq(schema.member.organizationId, i.organizationId),
                  eq(schema.member.userId, cancelledBy.id),
                ),
              )
            if (!isOwner(m?.role))
              throw new APIError('FORBIDDEN', {
                message: 'Only an owner can cancel an owner invitation',
              })
          },
          afterCancelInvitation: async ({ invitation: i, cancelledBy }) => {
            await auditMember('invite.cancel', cancelledBy.id, {
              orgId: i.organizationId,
              invitationId: i.id,
            })
          },
          afterAcceptInvitation: async ({ invitation: i, member: m }) => {
            await auditMember('invite.accept', m.userId, {
              orgId: i.organizationId,
              invitationId: i.id,
              memberId: m.id,
              to: m.role,
            })
            emit({
              type: 'invite.accepted',
              organizationId: i.organizationId,
              invitationId: i.id,
              userId: m.userId,
            })
          },
          afterRejectInvitation: async ({ invitation: i, user }) => {
            await auditMember('invite.reject', user.id, {
              orgId: i.organizationId,
              invitationId: i.id,
            })
          },
          afterAddMember: async ({ member: m }) => {
            await auditMember('member.add', m.userId, {
              orgId: m.organizationId,
              memberId: m.id,
              to: m.role,
            })
          },
          afterRemoveMember: async ({ member: m }) => {
            await auditMember('member.remove', m.userId, {
              orgId: m.organizationId,
              memberId: m.id,
              from: m.role,
            })
          },
          afterUpdateMemberRole: async ({ member: m, previousRole }) => {
            await auditMember('member.role', m.userId, {
              orgId: m.organizationId,
              memberId: m.id,
              from: previousRole,
              to: m.role,
            })
            emit({
              type: 'member.role_changed',
              organizationId: m.organizationId,
              userId: m.userId,
              role: m.role,
              // The hook's `user` is the member changed; the actor is the session.
              actorId: actorId() ?? null,
            })
          },
          // Slug and name mirror tenant-directory, which owns them.
          beforeUpdateOrganization: async ({ organization: o }) => {
            if (o.slug !== undefined || o.name !== undefined) {
              throw new APIError('FORBIDDEN', {
                message: 'Slug and name are managed by tenant-directory',
              })
            }
          },
        },
      }),
      // The tenant site's server presents the session it got from the
      // handoff (src/handoff.ts) as a signed bearer token, never a cookie.
      bearer({ requireSignature: true }),
    ],
  })
}
