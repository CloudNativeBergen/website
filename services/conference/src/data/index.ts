// Public data layer. createData is the ONLY export resolvers see:
// it returns Scoped repositories, never the raw handle.
import { and, eq } from 'drizzle-orm'
import { createGraphQLError } from 'graphql-yoga'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'
import { rawDb } from './db'
import { conferences } from './schema'

export type ConferenceRow = typeof conferences.$inferSelect

/** The writable fields. Omitted = untouched; null = unset. */
export type ConferencePatch = Partial<
  Omit<ConferenceRow, 'conferenceId' | 'orgId' | 'published' | 'updatedAt'>
>

/** Org roles that may write (#1881, owner decision 3). */
const WRITERS = new Set(['owner', 'admin'])

const fail = (message: string, code: string) =>
  createGraphQLError(message, { extensions: { code } })

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

  /**
   * Patches the envelope's Conference, never one the caller names. Only an
   * owner or admin of the org may write; the check runs before any query, so
   * a refusal says nothing about whether the row exists.
   */
  async update(patch: ConferencePatch): Promise<ConferenceRow> {
    const { userId, orgRole } = this.tenant
    // better-auth stores several roles comma-separated.
    const roles = orgRole?.split(',').map((r) => r.trim()) ?? []
    if (!userId || !roles.some((r) => WRITERS.has(r))) {
      throw fail(
        'updating the conference requires an org owner or admin',
        'FORBIDDEN',
      )
    }
    const { org_id, conference_id } = this.columns
    if (!conference_id) throw fail('no conference in this request', 'NOT_FOUND')
    const where = and(
      eq(conferences.orgId, org_id),
      eq(conferences.conferenceId, conference_id),
    )
    // ponytail: read-then-write, not atomic; a racing date edit can slip past
    // the order check. Move it into the UPDATE's WHERE if that matters.
    const row = await this.db.query.conferences.findFirst({ where })
    if (!row) throw fail('conference not found', 'NOT_FOUND')
    const start = 'startDate' in patch ? patch.startDate : row.startDate
    const end = 'endDate' in patch ? patch.endDate : row.endDate
    // Only when the patch sets a date: stored legacy values never block an
    // unrelated edit.
    const touchesDates = 'startDate' in patch || 'endDate' in patch
    if (touchesDates && start && end && end < start) {
      throw fail('endDate is before startDate', 'BAD_USER_INPUT')
    }
    const [updated] = await this.db
      .update(conferences)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(where)
      .returning()
    if (!updated) throw fail('conference not found', 'NOT_FOUND')
    return updated
  }

  /** Entity resolution: an id other than the envelope's resolves to null. */
  async byId(id: string): Promise<ConferenceRow | null> {
    return id === this.columns.conference_id ? this.current() : null
  }
}

export function createData(d1: D1Database, envelope: Envelope) {
  const db = rawDb(d1)
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request.
  return { conferences: () => new Conferences(db, envelope) }
}
