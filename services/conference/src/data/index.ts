// Public data layer. createData is the ONLY export resolvers see:
// it returns Scoped repositories, never the raw handle.
import { and, desc, eq, sql } from 'drizzle-orm'
import { createGraphQLError } from 'graphql-yoga'
import {
  ScopedRepository,
  unscopedForPlatformOps,
  type Envelope,
  type PlatformContext,
} from '@runkonf/tenancy'
import { rawDb } from './db'
import { conferences } from './schema'
import { conferenceParityStatus } from './job-status'

export type ConferenceRow = typeof conferences.$inferSelect

/** The writable fields. Omitted = untouched; null = unset. */
export type ConferencePatch = Partial<
  Omit<ConferenceRow, 'conferenceId' | 'orgId' | 'updatedAt'>
>

/** Org roles that may write (#1881, owner decision 3). */
const WRITERS = new Set(['owner', 'admin'])

/**
 * Minted by the gateway only on its operator lane (#1921); a tenant-site
 * envelope always carries `scopes: []`, and the subgraph verifies the signature.
 */
const OPERATOR_SCOPE = 'platform:operator'

const fail = (message: string, code: string) =>
  createGraphQLError(message, { extensions: { code } })

const dateOrder = () =>
  createGraphQLError('endDate is before startDate', {
    extensions: { code: 'BAD_USER_INPUT', field: 'endDate' },
  })

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
   * The envelope org's editions, never another org's: the org comes from the
   * envelope only (#1970). Members of the org see every edition; anyone else
   * only published, live ones, since listing an unlisted edition would index
   * it (`unlisted`: reachable by link, not indexed).
   */
  async editions(): Promise<ConferenceRow[]> {
    const own = eq(conferences.orgId, this.columns.org_id)
    return this.db.query.conferences.findMany({
      where: this.tenant.orgRole
        ? own
        : and(
            own,
            eq(conferences.published, true),
            eq(conferences.visibility, 'live'),
          ),
      orderBy: [desc(conferences.startDate), conferences.conferenceId],
    })
  }

  /**
   * Patches the envelope's Conference, never one the caller names. Only an
   * owner or admin of the org may write; the check runs before any query, so
   * a refusal says nothing about whether the row exists.
   */
  async update(patch: ConferencePatch): Promise<ConferenceRow> {
    const { userId, orgRole, scopes } = this.tenant
    // better-auth stores several roles comma-separated.
    const roles = orgRole?.split(',').map((r) => r.trim()) ?? []
    const operator = scopes.includes(OPERATOR_SCOPE)
    if (!userId || !(operator || roles.some((r) => WRITERS.has(r)))) {
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
    const row = await this.db.query.conferences.findFirst({ where })
    if (!row) throw fail('conference not found', 'NOT_FOUND')
    // A patch that changes nothing is a no-op: updated_at stays put.
    const changes = Object.entries(patch).some(
      ([k, v]) =>
        JSON.stringify(v) !== JSON.stringify(row[k as keyof ConferenceRow]),
    )
    if (!changes) return row
    // The date-order check runs inside the UPDATE, on the merged values, so a
    // concurrent edit between the read above and this write cannot slip past
    // it. Only when the patch sets a date: stored legacy values never block
    // an unrelated edit.
    const merged = (k: 'startDate' | 'endDate') =>
      k in patch ? sql`${patch[k] ?? null}` : sql`${conferences[k]}`
    const [s, e] = [merged('startDate'), merged('endDate')]
    const touchesDates = 'startDate' in patch || 'endDate' in patch
    const [updated] = await this.db
      .update(conferences)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(
        touchesDates
          ? and(where, sql`(${s} IS NULL OR ${e} IS NULL OR ${s} <= ${e})`)
          : where,
      )
      .returning()
    if (!updated) {
      // The row is the envelope's own (same where), so this says nothing
      // about anyone else's.
      if (await this.db.query.conferences.findFirst({ where }))
        throw dateOrder()
      throw fail('conference not found', 'NOT_FOUND')
    }
    // Every write on the operator lane is audited (#1921).
    // ponytail: log only; a D1 audit table when someone needs to query it.
    if (operator)
      console.log(
        JSON.stringify({
          event: 'operator.write',
          'konf.user_id': userId,
          'konf.org_id': org_id,
          'konf.conference_id': conference_id,
          fields: Object.keys(patch),
          at: new Date().toISOString(),
        }),
      )
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
  return {
    conferences: () => new Conferences(db, envelope),
    conferenceParityStatus: () => conferenceParityStatus(d1),
    /**
     * Any org's edition, by id, for the operator `conferences` list (#1985).
     * unscopedForPlatformOps throws for anything but a PlatformContext.
     */
    platformEdition: (id: string) =>
      unscopedForPlatformOps(
        envelope as PlatformContext,
        'operator conferences list (#1985)',
        // ponytail: one log line per edition; batch if a page gets noisy.
        (e) =>
          console.log(
            JSON.stringify({
              event: 'operator.read',
              ...e,
              'konf.conference_id': id,
            }),
          ),
        () =>
          db.query.conferences.findFirst({
            where: eq(conferences.conferenceId, id),
          }),
      ),
  }
}

// The cron (#1892): the generated worker calls it with env, never a resolver.
export { scheduled, type ScheduledEnv } from './parity'
