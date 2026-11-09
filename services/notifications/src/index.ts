// konf-notifications (epic #2215): RPC only, reached by service binding
// (`"entrypoint": "Notifications"`). No HTTP surface.
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { NotificationEvent } from '@runkonf/tenancy'
import { createData, type DataEnv } from './data'

export class Notifications extends WorkerEntrypoint<DataEnv> {
  /** Never rejects: a failure is logged, never thrown at the caller. */
  async send(event: NotificationEvent): Promise<void> {
    await createData(this.env).send(event)
  }
}

export default {
  fetch: () => new Response('Not found', { status: 404 }),
} satisfies ExportedHandler<DataEnv>
