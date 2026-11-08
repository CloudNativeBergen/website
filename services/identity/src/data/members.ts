// Membership writes for the identity subgraph (#1923 PR 3). Two paths:
// - a member (owner/admin) acts through Better Auth's own endpoints, called
//   in-process with their user as the session (`actAs` in auth.ts);
// - a platform operator, who is never a member, writes `member` and
//   `invitation` directly. The last-owner triggers and the pending-invite
//   unique index (migrations/0003) are the backstop there.
// Every target is looked up inside the caller's org before anything else, so
// a foreign id and an unknown one get the same NOT_FOUND. Ids only in audit
// rows and errors, never emails (#1310).
import { runWithRequestState } from '@better-auth/core/context'
import { isAPIError } from 'better-auth/api'
import { and, eq, gt, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  INVITATION_EXPIRES_IN,
  actAs,
  createAuth,
  isOwner,
  type AuthEnv,
} from './auth'
import {
  can,
  principalOf,
  principalOfRole,
  type Envelope,
} from '@runkonf/tenancy'
import { rawDb } from './db'
import { deliverInvitation, namesFor } from './invitations'
import { emit } from './push'
import {
  account,
  auditEvent,
  invitation,
  member,
  organization,
  user,
} from './schema'

export type MemberRole = 'owner' | 'admin' | 'member'

/** A refusal the subgraph returns as is: its code and a fixed message. */
export class MemberError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_USER_INPUT',
    message: string,
  ) {
    super(message)
  }
}

const notFound = () => new MemberError('NOT_FOUND', 'Not found.')
const forbidden = () =>
  new MemberError('FORBIDDEN', 'Not allowed to manage this member')
const LAST_OWNER = 'An organization must keep at least one owner'

/** Plugin and D1 failures as MemberErrors; anything else stays a 500. */
function clean(e: unknown): never {
  const text = (x: unknown): string =>
    x instanceof Error ? `${x.message} ${text(x.cause)}` : ''
  if (/LAST_OWNER/.test(text(e)))
    throw new MemberError('BAD_USER_INPUT', LAST_OWNER)
  if (
    /UNIQUE constraint failed: index 'invitation_pending_org_email_idx'|invitation_pending_org_email_idx/.test(
      text(e),
    )
  )
    throw new MemberError(
      'BAD_USER_INPUT',
      'This address already has a pending invitation',
    )
  if (isAPIError(e)) {
    if (e.statusCode === 401 || e.statusCode === 403) throw forbidden()
    if (e.statusCode < 500)
      throw new MemberError('BAD_USER_INPUT', e.message || 'Invalid request')
  }
  throw e
}

export interface Invitation {
  id: string
  role: string | null
  status: string
  expiresAt: Date
}

export function createMembers(env: AuthEnv & { DB: D1Database }) {
  const db = rawDb(env.DB)

  const memberOf = async (orgId: string, userId: string) =>
    (
      await db
        .select({ id: member.id, role: member.role })
        .from(member)
        .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    )[0]
  const invitationIn = async (orgId: string, id: string) =>
    (
      await db
        .select({
          id: invitation.id,
          role: invitation.role,
          status: invitation.status,
        })
        .from(invitation)
        .where(and(eq(invitation.organizationId, orgId), eq(invitation.id, id)))
    )[0]

  /**
   * A member of `orgId` acting through Better Auth. The org is the envelope's,
   * never an argument. Only owners and admins get past the first check, and
   * only owners touch owners (owner members, owner invitations, the owner role).
   */
  async function asMember(actorId: string, orgId: string) {
    const actor = await memberOf(orgId, actorId)
    const [u] = await db.select().from(user).where(eq(user.id, actorId))
    if (!u || !can(principalOfRole(actor?.role), 'org.manage_members'))
      throw forbidden()
    const owner = isOwner(actor!.role)
    const auth = createAuth(env.DB, env)
    // A server-side session for the actor: never stored, no active org (every
    // call names the org), seen only by the calls made inside `run`.
    const now = new Date()
    const session = {
      user: u,
      session: {
        id: `server:${actorId}`,
        token: '',
        userId: actorId,
        activeOrganizationId: null,
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        updatedAt: now,
        ipAddress: null,
        userAgent: null,
      },
    }
    const run = <T>(call: () => Promise<T>) =>
      runWithRequestState(new WeakMap(), async () => {
        await actAs.set(session)
        return call()
      }).catch(clean)
    const target = async (userId: string) => {
      const m = await memberOf(orgId, userId)
      if (!m) throw notFound()
      return m
    }

    return {
      async invite(email: string, role: MemberRole): Promise<Invitation> {
        if (role === 'owner' && !owner) throw forbidden()
        const inv = await run(() =>
          auth.api.createInvitation({
            headers: new Headers(),
            body: { email, role, organizationId: orgId },
          }),
        )
        return inv
      },
      async cancelInvitation(invitationId: string) {
        const inv = await invitationIn(orgId, invitationId)
        if (!inv) throw notFound()
        if (isOwner(inv.role) && !owner) throw forbidden()
        await run(() =>
          auth.api.cancelInvitation({
            headers: new Headers(),
            body: { invitationId },
          }),
        )
      },
      async remove(userId: string) {
        const m = await target(userId)
        if (isOwner(m.role) && !owner) throw forbidden()
        await run(() =>
          auth.api.removeMember({
            headers: new Headers(),
            body: { memberIdOrEmail: m.id, organizationId: orgId },
          }),
        )
      },
      async changeRole(userId: string, role: MemberRole) {
        const m = await target(userId)
        if ((isOwner(m.role) || role === 'owner') && !owner) throw forbidden()
        await run(() =>
          auth.api.updateMemberRole({
            headers: new Headers(),
            body: { memberId: m.id, role, organizationId: orgId },
          }),
        )
      },
    }
  }

  /**
   * A platform operator. `orgId` is an explicit argument (PlatformContext has
   * none) and lands in every audit row with the actor and `operator: true`.
   * Each write and its audit row go in one D1 batch: both or neither.
   */
  async function asOperator(actorId: string, orgId: string) {
    const [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, orgId))
    if (!org) throw new MemberError('BAD_USER_INPUT', 'Unknown organization')
    const audit = (
      action: string,
      userId: string,
      detail: Record<string, string | null | undefined>,
    ) =>
      db.insert(auditEvent).values({
        action,
        userId,
        subjectUserId: userId,
        detail: JSON.stringify({ actorId, operator: true, orgId, ...detail }),
      })
    const target = async (userId: string) => {
      const m = await memberOf(orgId, userId)
      if (!m) throw notFound()
      return m
    }

    return {
      async invite(email: string, role: MemberRole): Promise<Invitation> {
        // As the plugin's createInvitation: lowercase, then z.email().
        const to = email.trim().toLowerCase()
        if (!z.email().safeParse(to).success)
          throw new MemberError('BAD_USER_INPUT', 'Invalid email address')
        // Accepting would hit member(userId, organizationId) UNIQUE as a 500.
        const [existing] = await db
          .select({ id: member.id })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(
            and(
              eq(member.organizationId, orgId),
              eq(sql`lower(${user.email})`, to),
            ),
          )
        if (existing)
          throw new MemberError(
            'BAD_USER_INPUT',
            'This address already belongs to a member',
          )
        const row = {
          id: crypto.randomUUID(),
          organizationId: orgId,
          email: to,
          role,
          status: 'pending',
          expiresAt: new Date(Date.now() + INVITATION_EXPIRES_IN * 1000),
          inviterId: actorId,
        }
        await db
          .batch([
            // An expired invitation stays pending; retire it as the plugin does.
            db
              .update(invitation)
              .set({ status: 'canceled' })
              .where(
                and(
                  eq(invitation.organizationId, orgId),
                  eq(sql`lower(${invitation.email})`, row.email),
                  eq(invitation.status, 'pending'),
                  lte(invitation.expiresAt, new Date()),
                ),
              ),
            db.insert(invitation).values(row),
            audit('invite.create', actorId, { invitationId: row.id, to: role }),
          ])
          .catch(clean)
        await deliverInvitation(env.SITE_MAIL, {
          invitationId: row.id,
          email: row.email,
          orgId,
          inviterId: actorId,
          ...(await namesFor(env.DB, orgId, actorId)),
        })
        return row
      },
      async cancelInvitation(invitationId: string) {
        const inv = await invitationIn(orgId, invitationId)
        if (!inv) throw notFound()
        if (inv.status !== 'pending')
          throw new MemberError(
            'BAD_USER_INPUT',
            'Only a pending invitation can be cancelled',
          )
        await db.batch([
          db
            .update(invitation)
            .set({ status: 'canceled' })
            .where(eq(invitation.id, inv.id)),
          audit('invite.cancel', actorId, { invitationId: inv.id }),
        ])
      },
      async remove(userId: string) {
        const m = await target(userId)
        await db
          .batch([
            db.delete(member).where(eq(member.id, m.id)),
            audit('member.remove', userId, { memberId: m.id, from: m.role }),
          ])
          .catch(clean)
      },
      async changeRole(userId: string, role: MemberRole) {
        const m = await target(userId)
        // #1967: both statements depend on the role read above, in one D1
        // batch (one transaction), so a concurrent change makes neither happen
        // and the audit row never names a role other than the one it replaced.
        const detail = JSON.stringify({
          actorId,
          operator: true,
          orgId,
          memberId: m.id,
          from: m.role,
          to: role,
        })
        const [, updated] = await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO audit_event (action, userId, detail) SELECT 'member.role', ?1, ?2 FROM member WHERE id = ?3 AND role = ?4",
          ).bind(userId, detail, m.id, m.role),
          env.DB.prepare(
            'UPDATE member SET role = ?1 WHERE id = ?2 AND role = ?3',
          ).bind(role, m.id, m.role),
        ]).catch(clean)
        if (!updated.meta.changes)
          throw new MemberError(
            'BAD_USER_INPUT',
            "The member's role changed meanwhile; reload and try again",
          )
        emit({
          type: 'member.role_changed',
          organizationId: orgId,
          userId,
          role,
          actorId,
        })
      },
    }
  }

  /**
   * Read side (#1972). The caller has already decided access from the
   * envelope; `orgId` is the envelope's, never an argument. Emails are read
   * only when `withEmail` is set (owners, admins, operators).
   */
  const list = async (orgId: string, withEmail: boolean) => {
    const rows = await db
      .select({
        userId: member.userId,
        name: user.name,
        role: member.role,
        joinedAt: member.createdAt,
        email: withEmail ? user.email : sql<null>`NULL`,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId))
      .orderBy(member.createdAt)
    // Provider names only, for managers only, in one query per page (#1990).
    const byUser = new Map<string, string[]>()
    if (withEmail && rows.length) {
      const linked = await db
        .selectDistinct({
          userId: account.userId,
          providerId: account.providerId,
        })
        .from(account)
        // A join, not inArray: D1 caps bound parameters at 100 (#2018).
        .innerJoin(member, eq(member.userId, account.userId))
        .where(eq(member.organizationId, orgId))
        .orderBy(account.providerId)
      for (const a of linked)
        byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a.providerId])
    }
    return rows.map((r) => ({ ...r, providers: byUser.get(r.userId) ?? [] }))
  }
  const pendingInvitations = (orgId: string, now = new Date()) =>
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, orgId),
          eq(invitation.status, 'pending'),
          gt(invitation.expiresAt, now),
        ),
      )
      .orderBy(invitation.expiresAt)

  /**
   * Emergency revocation (docs/AUTHORIZATION.md §3.6): the user's member rows,
   * sessions and operator flag, with one audit row, in ONE batch. Refused
   * before any read for anything but an operator on the platform lane. A
   * membership whose loss would leave an org without an owner is kept and
   * reported (the LAST_OWNER trigger would abort the whole batch). An
   * already-issued identity JWT lives up to 300 s more.
   */
  async function revokeAll(envelope: Envelope | null, userId: string) {
    if (
      envelope?.typ !== 'platform' ||
      !can(principalOf(envelope), 'user.revoke_all')
    )
      throw forbidden()
    // The trigger's own owner test (migration 0003), so the two agree.
    const owner = (col: string) =>
      `(',' || lower(replace(replace(replace(replace(${col}, ' ', ''), char(9), ''), char(10), ''), char(13), '')) || ',') LIKE '%,owner,%'`
    const { results } = await env.DB.prepare(
      `SELECT m.organizationId AS orgId FROM member m WHERE m.userId = ?1 AND ${owner('m.role')} AND NOT EXISTS (SELECT 1 FROM member o WHERE o.organizationId = m.organizationId AND o.id <> m.id AND ${owner('o.role')}) ORDER BY 1`,
    )
      .bind(userId)
      .all<{ orgId: string }>()
    const kept = results.map((r) => r.orgId)
    const detail = JSON.stringify({ operator: true, keptLastOwnerOf: kept })
    const [, members, sessions] = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO audit_event (action, userId, subject_user_id, detail) VALUES ('user.revoke_all', ?1, ?2, ?3)",
      ).bind(envelope.userId, userId, detail),
      env.DB.prepare(
        'DELETE FROM member WHERE userId = ?1 AND organizationId NOT IN (SELECT value FROM json_each(?2))',
      ).bind(userId, JSON.stringify(kept)),
      env.DB.prepare('DELETE FROM session WHERE userId = ?1').bind(userId),
      env.DB.prepare('UPDATE user SET platformOperator = 0 WHERE id = ?1').bind(
        userId,
      ),
    ]).catch(clean)
    return {
      membersRemoved: members.meta.changes,
      sessionsRevoked: sessions.meta.changes,
      keptLastOwnerOf: kept,
    }
  }

  return { asMember, asOperator, list, pendingInvitations, revokeAll }
}
