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
   * Whether the edition sells tickets (`sellsTickets`), published or
   * not: tenant-directory's plan gate on going live (#2129). A boolean only.
   */
  ticketed(orgId: string, conferenceId: string) {
    return isTicketed(this.env.DB, orgId, conferenceId)
  }

  /**
   * tenant-directory's edition writes (provisionConference, createOrganization,
   * signUpOrganization) create the row here too, or editions() never lists
   * it. Unpublished, visibility live (backfill defaults). Idempotent: an
   * existing row is never touched, so a retry heals a missing one only.
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
  }
}

export default worker
