// Public data layer. Exports functions and the auth instance, never the raw handle.
import { and, eq, like, lt } from 'drizzle-orm'
import { rawDb } from './db'
import {
  account,
  auditEvent,
  member,
  organization,
  user,
  verification,
} from './schema'

export { createAuth, type AuthEnv } from './auth'
export { openInvitationFor } from './invitations'
import type { AuthEnv } from './auth'
import { createMembers } from './members'
export { MemberError, type MemberRole } from './members'
import { syncMembers, type SyncEnv } from './member-sync'
import { memberSyncStatus } from './job-status'
import { createPushSubscriptions } from './push-subscriptions'
import { createSpeakerProfiles } from './speaker-profiles'

/** What the gateway needs per request to mint an envelope. */
export interface Principal {
  /** null when the user is not a member of the Organization. */
  orgRole: string | null
  /** Entitles Platform context. */
  platformOperator: boolean
}

export interface DataEnv extends SyncEnv, AuthEnv {
  DB: D1Database
  /** konf-tenant-directory over a service binding: verified origins (#688). */
  DIRECTORY: Fetcher
}

const TENANT_QUERY =
  'query ($host: String!) { tenantByHost(host: $host) { hostname } }'

export function createData(env: DataEnv) {
  const db = rawDb(env.DB)
  return {
    memberSyncStatus: () => memberSyncStatus(env.DB),
    /** Grants missing organizer memberships from Sanity (cron, #1907). */
    syncMembers: () => syncMembers(env),
    /** Membership writes for the subgraph (#1923): member and operator paths. */
    members: () => createMembers(env),
    /** Web push subscriptions (kontroll#61). */
    pushSubscriptions: () => createPushSubscriptions(env.DB),
    /** Global speaker profiles (#2093). */
    speakerProfiles: () => createSpeakerProfiles(env.DB),
    /**
     * True only for an exact `https://<host>` origin (no path, port or
     * userinfo) whose host the directory holds as verified for an active
     * Organization. The anonymous lookup hides everything else.
     */
    async isVerifiedOrigin(origin: string): Promise<boolean> {
      let url: URL
      try {
        url = new URL(origin)
      } catch {
        return false
      }
      if (origin !== `https://${url.hostname}`) return false
      const res = await env.DIRECTORY.fetch(
        'https://tenant-directory.internal/graphql',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: TENANT_QUERY,
            variables: { host: url.hostname },
          }),
        },
      )
      if (!res.ok) return false
      const { data } = (await res.json()) as {
        data?: { tenantByHost: { hostname: string } | null }
      }
      return data?.tenantByHost?.hostname === url.hostname
    },
    /** The user holding a provider account, for the session upgrade. */
    async userIdForAccount(providerId: string, accountId: string) {
      const [row] = await db
        .select({ userId: account.userId })
        .from(account)
        .where(
          and(
            eq(account.providerId, providerId),
            eq(account.accountId, accountId),
          ),
        )
        .limit(1)
      return row?.userId
    },
    /** Stores a handoff record under a hashed key. */
    async putHandoff(key: string, value: string, expiresAt: Date) {
      // Unredeemed handoffs would otherwise pile up.
      await db
        .delete(verification)
        .where(
          and(
            like(verification.identifier, 'handoff:%'),
            lt(verification.expiresAt, new Date()),
          ),
        )
      await db
        .insert(verification)
        .values({ id: crypto.randomUUID(), identifier: key, value, expiresAt })
    },
    /** Handoff audit row: ids, origin and match type only. */
    async audit(
      action: 'handoff.exchange' | 'session.upgrade',
      userId: string,
      origin: string,
      detail?: string,
    ) {
      await db.insert(auditEvent).values({ action, userId, origin, detail })
    },
    /**
     * Deletes and returns in one statement, so two concurrent redemptions
     * cannot both read the record (single use).
     */
    async takeHandoff(key: string) {
      const [row] = await db
        .delete(verification)
        .where(eq(verification.identifier, key))
        .returning({
          value: verification.value,
          expiresAt: verification.expiresAt,
        })
      return row ?? null
    },
    /**
     * Tenant-directory owns org ids. Idempotent on id; a slug taken by
     * another id still fails (UNIQUE).
     */
    async ensureOrganization(id: string, slug: string): Promise<void> {
      await db
        .insert(organization)
        .values({ id, slug, name: slug })
        .onConflictDoNothing({ target: organization.id })
    },
    /**
     * Kontroll (an operator origin) admits platform operators and members of
     * at least one organization (#1956). A pending invitation is no member row.
     */
    async mayUseOperatorOrigin(userId: string): Promise<boolean> {
      const [row] = await db
        .select({ op: user.platformOperator, m: member.id })
        .from(user)
        .leftJoin(member, eq(member.userId, user.id))
        .where(eq(user.id, userId))
        .limit(1)
      return !!row && (row.op || row.m !== null)
    },
    /**
     * The orgs `userId` is a member of, with the role there (#2036). A pending
     * invitation is no member row.
     */
    memberships: (userId: string) =>
      db
        .select({ orgId: member.organizationId, role: member.role })
        .from(member)
        .where(eq(member.userId, userId))
        .orderBy(member.organizationId),
    /** Live membership; null for an unknown user. */
    async principal(userId: string, orgId: string): Promise<Principal | null> {
      const [row] = await db
        .select({
          platformOperator: user.platformOperator,
          orgRole: member.role,
        })
        .from(user)
        .leftJoin(
          member,
          and(eq(member.userId, user.id), eq(member.organizationId, orgId)),
        )
        .where(eq(user.id, userId))
        .limit(1)
      return row
        ? { orgRole: row.orgRole, platformOperator: row.platformOperator }
        : null
    },
  }
}
