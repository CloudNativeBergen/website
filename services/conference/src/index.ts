// Worker entry: the generated worker, plus the ProgramDate entrypoint that
// services/program binds to (programDate is D1-owned, #2023).
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createData } from './data'
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
}

export default worker
