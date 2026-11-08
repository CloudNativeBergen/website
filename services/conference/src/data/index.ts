// Public data layer. createData is the ONLY export resolvers see:
// it returns Scoped repositories, never the raw handle.
import { and, desc, eq, sql } from 'drizzle-orm'
import { createGraphQLError } from 'graphql-yoga'
import {
  ScopedRepository,
  can,
  principalOf,
  SITE_SCOPE,
  unscopedForPlatformOps,
  type Envelope,
  type PlatformContext,
} from '@runkonf/tenancy'
import { rawDb } from './db'
import { conferences } from './schema'
import { conferenceParityStatus } from './job-status'
import { emitAudit } from '../push'

export type ConferenceRow = typeof conferences.$inferSelect

/** The writable fields. Omitted = untouched; null = unset. */
export type ConferencePatch = Partial<
  Omit<ConferenceRow, 'conferenceId' | 'orgId' | 'updatedAt'>
>

/** The site's server lane (api/src/gateway.ts SITE_SCOPE), set only for a verified site assertion. */
export { SITE_SCOPE }
/** The workshop reminder's rate limit (src/lib/workshop/reminder.ts). */
export const REMINDER_WINDOW_MS = 60 * 60 * 1000
const BINDING = ['checkinEventId', 'titoAccountSlug', 'titoEventSlug'] as const

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
  /** C2: unpublished editions (owner decision 1: members are insiders). */
  private insider() {
    return can(principalOf(this.tenant), 'conference.read_draft')
  }

  async current(): Promise<ConferenceRow | null> {
    const { org_id, conference_id } = this.columns
    if (!conference_id) return null
    const row = await this.db.query.conferences.findFirst({
      where: and(
        eq(conferences.orgId, org_id),
        eq(conferences.conferenceId, conference_id),
      ),
    })
    if (!row || (!row.published && !this.insider())) return null
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
      where: this.insider()
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
   * owner or admin of the org, or a platform operator acting for it (scope
   * platform:operator, audited), may write; the check runs before any query,
   * so a refusal says nothing about whether the row exists.
   */
  async update(patch: ConferencePatch): Promise<ConferenceRow> {
    const { userId, scopes } = this.tenant
    const p = principalOf(this.tenant)
    const operator = p.has('Op')
    if (!can(p, 'conference.update_settings')) {
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
    // PLATFORM-SET ONLY (#745, #2080, #2085): every tenant shares the
    // platform's ticketing credentials, so an org admin rebinding the vendor
    // event could squat another org's. Re-sending the stored value is not a
    // change. The site's server lane (SITE_SCOPE) is trusted because the site
    // router enforces the platform-operator rule before writing here, and
    // only updateTicketingIds admits these keys (locked by
    // __tests__/server/ticketing-binding-guard.test.ts).
    const rebinds = BINDING.some(
      (k) => k in patch && (patch[k] ?? null) !== (row[k] ?? null),
    )
    // ponytail: the site:server arm goes in phase 2b (docs/AUTHORIZATION.md).
    if (
      rebinds &&
      !can(p, 'conference.bind_ticketing') &&
      !scopes.includes(SITE_SCOPE)
    )
      throw fail(
        'only a platform operator can change the ticketing event binding',
        'FORBIDDEN',
      )
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
    // Every write on the operator lane is audited (#1921): identity
    // audit_event over the bus, plus the log line in case the bus is down.
    if (operator) {
      emitAudit({
        type: 'operator.write',
        actorId: userId!,
        organizationId: org_id,
        conferenceId: conference_id,
        fields: Object.keys(patch),
      })
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
    }
    return updated
  }

  /**
   * The workshop reminder's hourly lock (#2080). Only the site's server lane
   * (whose router has already admitted a workshop admin) or an operator; the
   * generic patch never touches these columns. Checked before any query.
   */
  private reminderWhere() {
    if (!can(principalOf(this.tenant), 'reminder_lock'))
      throw fail('the reminder lock is for the site lane only', 'FORBIDDEN')
    const { org_id, conference_id } = this.columns
    if (!conference_id) throw fail('no conference in this request', 'NOT_FOUND')
    return and(
      eq(conferences.orgId, org_id),
      eq(conferences.conferenceId, conference_id),
    )
  }

  /**
   * Claims the hour: ONE conditional UPDATE, so of two concurrent callers
   * exactly one matches the row. Free means no reservation, an unparsable
   * one, or one at least REMINDER_WINDOW_MS old. Returns the token (the
   * stored time) to release with, or how long until the hour is free.
   */
  async reserveReminder(
    now = Date.now(),
  ): Promise<{ token: string | null; retryAfterMs: number | null }> {
    const where = this.reminderWhere()
    const token = new Date(now).toISOString()
    const cutoff = new Date(now - REMINDER_WINDOW_MS).toISOString()
    const col = conferences.workshopReminderReservedAt
    const [row] = await this.db
      .update(conferences)
      .set({ workshopReminderReservedAt: token })
      .where(
        and(
          where,
          sql`(${col} IS NULL OR julianday(${col}) IS NULL OR julianday(${col}) <= julianday(${cutoff}))`,
        ),
      )
      .returning({ at: col })
    if (row) return { token, retryAfterMs: null }
    const held = await this.db.query.conferences.findFirst({ where })
    if (!held) throw fail('conference not found', 'NOT_FOUND')
    const until = Date.parse(held.workshopReminderReservedAt ?? '')
    return {
      token: null,
      retryAfterMs: Math.max(1000, until + REMINDER_WINDOW_MS - now),
    }
  }

  /** Gives the hour back only if it is still `token`'s. */
  async releaseReminder(token: string): Promise<boolean> {
    const where = this.reminderWhere()
    const rows = await this.db
      .update(conferences)
      .set({ workshopReminderReservedAt: null })
      .where(and(where, eq(conferences.workshopReminderReservedAt, token)))
      .returning({ id: conferences.conferenceId })
    return rows.length > 0
  }

  /** The last send, for the dialog. */
  async recordReminder(sentAt: string, count: number): Promise<boolean> {
    const where = this.reminderWhere()
    if (
      Number.isNaN(Date.parse(sentAt)) ||
      !Number.isInteger(count) ||
      count < 0
    )
      throw fail('invalid reminder record', 'BAD_USER_INPUT')
    const rows = await this.db
      .update(conferences)
      .set({
        workshopReminderLastSentAt: sentAt,
        workshopReminderLastSentCount: count,
      })
      .where(where)
      .returning({ id: conferences.conferenceId })
    return rows.length > 0
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
