// Public data layer. Exports functions and the auth instance, never the raw handle.
import { and, eq } from 'drizzle-orm'
import { rawDb } from './db'
import { member, organization, user } from './schema'

export { createAuth, type AuthEnv } from './auth'

/** What the gateway needs per request to mint an envelope. */
export interface Principal {
  /** null when the user is not a member of the Organization. */
  orgRole: string | null
  /** Entitles Platform context. */
  platformOperator: boolean
}

export function createData(d1: D1Database) {
  const db = rawDb(d1)
  return {
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
