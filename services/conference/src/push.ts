// Web push (kontroll#61): hand the event to identity's `Push` entrypoint,
// which resolves recipients and sends. Fire and forget: the call runs after
// the response via waitUntil and can never fail the write that raised it.
// `cloudflare:workers` is imported lazily: api/scripts/compose.ts loads the
// subgraph schema under Node, where the module does not exist.
import type { ConferencePushEvent, OperatorAuditEvent } from '@runkonf/tenancy'

export interface PushBinding {
  send(event: ConferencePushEvent): Promise<void>
  /** Identity records it in audit_event (docs/AUTHORIZATION.md §3.6). */
  audit(event: OperatorAuditEvent): Promise<void>
}

const failed = (event: { type: string }) => (e: unknown) =>
  console.error(
    JSON.stringify({
      event: 'push.emit_failed',
      type: event.type,
      error: e instanceof Error ? e.message : 'unknown',
    }),
  )

export function emit(event: ConferencePushEvent) {
  import('cloudflare:workers')
    .then(({ env, waitUntil }) => {
      const push = (env as { PUSH?: PushBinding }).PUSH
      if (push) waitUntil(push.send(event).catch(failed(event)))
    })
    .catch(failed(event))
}

/** Operator write → identity audit_event, over the same binding. Never throws. */
export function emitAudit(event: OperatorAuditEvent) {
  import('cloudflare:workers')
    .then(({ env, waitUntil }) => {
      const push = (env as { PUSH?: PushBinding }).PUSH
      if (push) waitUntil(push.audit(event).catch(failed(event)))
      else failed(event)(new Error('no PUSH binding'))
    })
    .catch(failed(event))
}
