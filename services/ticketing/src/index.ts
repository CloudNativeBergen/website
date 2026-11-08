// Worker entry: the generated worker, plus the Ingest entrypoint the site's
// generic ticket webhook (#2146) binds to. A service binding is the only way
// in: no route reaches it, and the gateway never calls it.
import { WorkerEntrypoint } from 'cloudflare:workers'
import { ingestOrder, type IngestInput } from './data'
import worker, { type WorkerEnv } from './worker'

export type { IngestInput, EventRef, Money, OrderInput } from './data'

export class Ingest extends WorkerEntrypoint<WorkerEnv> {
  /**
   * Upserts one verified, normalised provider order, idempotent on
   * (EventRef, order externalId). The caller resolved orgId and conferenceId
   * from the EventRef; an EventRef bound to another conference is refused.
   */
  order(input: IngestInput) {
    return ingestOrder(this.env.DB, input)
  }
}

export default worker
