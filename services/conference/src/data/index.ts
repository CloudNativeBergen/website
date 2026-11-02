// Public data layer. createData is the ONLY export resolvers see:
// it returns Scoped repositories, never the raw handle.
import { and, eq } from 'drizzle-orm'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'
import { rawDb } from './db'
import { conferences } from './schema'

export type ConferenceRow = typeof conferences.$inferSelect

class Conferences extends ScopedRepository {
  constructor(
    private readonly db: ReturnType<typeof rawDb>,
    envelope: Envelope,
  ) {
    super(envelope)
  }

  /**
   * The envelope's Conference, never one the caller names. An unpublished
   * one is for members of the org only (epic #1772, req. 2).
   */
  async current(): Promise<ConferenceRow | null> {
    const { org_id, conference_id } = this.columns
    if (!conference_id) return null
    const row = await this.db.query.conferences.findFirst({
      where: and(
        eq(conferences.orgId, org_id),
        eq(conferences.conferenceId, conference_id),
      ),
    })
    if (!row || (!row.published && !this.tenant.orgRole)) return null
    return row
  }
}

export function createData(d1: D1Database, envelope: Envelope) {
  const db = rawDb(d1)
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request.
  return { conferences: () => new Conferences(db, envelope) }
}
