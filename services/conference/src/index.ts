// Worker entry: the generated worker, plus the ProgramDate entrypoint that
// services/program binds to (programDate is D1-owned, #2023).
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createData, isTicketed } from './data'
import worker, { type WorkerEnv } from './worker'

export class ProgramDate extends WorkerEntrypoint<WorkerEnv> {
  /**
   * The conference's programDate, read as an anonymous caller of that
   * tenant: the row must match both ids, and an unpublished one is null.
   */
  async programDate(orgId: string, conferenceId: string) {
    const row = await createData(this.env.DB, {
      typ: 'tenant',
      orgId,
      conferenceId,
      userId: null,
      orgRole: null,
      scopes: [],
    })
      .conferences()
      .current()
    return row?.programDate ?? null
  }

  /**
   * The dates cfp's speaker writes are judged by (#2078), read the same way:
   * an unpublished or missing conference is null, which cfp treats as closed.
   */
  async cfpWindow(orgId: string, conferenceId: string) {
    const row = await createData(this.env.DB, {
      typ: 'tenant',
      orgId,
      conferenceId,
      userId: null,
      orgRole: null,
      scopes: [],
    })
      .conferences()
      .current()
    return row
      ? {
          cfpStartDate: row.cfpStartDate,
          cfpEndDate: row.cfpEndDate,
          programDate: row.programDate,
          startDate: row.startDate,
        }
      : null
  }

  /**
   * The CFP Slack channel (`cfpNotificationChannel`, D1-owned) for
   * konf-notifications' proposal alerts (#2215), read like cfpWindow: an
   * unpublished or foreign conference is null.
   */
  async cfpChannel(orgId: string, conferenceId: string) {
    const row = await createData(this.env.DB, {
      typ: 'tenant',
      orgId,
      conferenceId,
      userId: null,
      orgRole: null,
      scopes: [],
    })
      .conferences()
      .current()
    return row?.cfpNotificationChannel ?? null
  }

  /**
   * Whether the edition sells tickets (`sellsTickets`), published or
   * not: tenant-directory's plan gate on going live (#2129). A boolean only.
   */
  ticketed(orgId: string, conferenceId: string) {
    return isTicketed(this.env.DB, orgId, conferenceId)
  }
}

/**
 * Edition rows written by tenant-directory alone: its wrangler binds this
 * entrypoint as EDITIONS, and no other service may (worker.test.ts checks).
 * cfp and program bind ProgramDate, which stays read-only.
 */
export class Editions extends WorkerEntrypoint<WorkerEnv> {
  /**
   * The conference subgraph row for a new edition (provisionConference,
   * createOrganization, signUpOrganization), or editions() never lists it.
   * Unpublished, visibility live (backfill defaults). An existing row is
   * never touched; one under another org throws, so a heal never succeeds
   * against another org's row.
   */
  async createEdition(
    orgId: string,
    conferenceId: string,
    title: string,
    startDate: string | null,
    endDate: string | null,
  ): Promise<void> {
    await this.env.DB.prepare(
      "INSERT INTO conferences (conference_id, org_id, published, title, start_date, end_date, visibility, social_links) VALUES (?, ?, 0, ?, ?, ?, 'live', '[]') ON CONFLICT (conference_id) DO NOTHING",
    )
      .bind(conferenceId, orgId, title, startDate, endDate)
      .run()
    const row = await this.env.DB.prepare(
      'SELECT org_id FROM conferences WHERE conference_id = ?',
    )
      .bind(conferenceId)
      .first<{ org_id: string }>()
    if (row?.org_id !== orgId)
      throw new Error(`conference ${conferenceId} belongs to another org`)
  }

  /**
   * Undoes createEdition for a rolled-back sign-up: deletes only a row of
   * that org that is still unpublished. Idempotent.
   */
  async deleteEdition(orgId: string, conferenceId: string): Promise<void> {
    await this.env.DB.prepare(
      'DELETE FROM conferences WHERE conference_id = ? AND org_id = ? AND published = 0',
    )
      .bind(conferenceId, orgId)
      .run()
  }
}

export default worker
