// Push webhook emits (kontroll#61). Fire and forget: the send runs after the
// response via waitUntil and can never fail the write that raised it.
// `cloudflare:workers` is imported lazily: api/scripts/compose.ts loads the
// subgraph schema under Node, where the module does not exist.
import { pushEvent, type PushEnv, type PushEvent } from '@runkonf/tenancy'

export function emit(event: PushEvent) {
  import('cloudflare:workers')
    .then(({ env, waitUntil }) => waitUntil(pushEvent(env as PushEnv, event)))
    .catch((e) =>
      console.error(
        JSON.stringify({
          event: 'push.emit_failed',
          type: event.type,
          error: e instanceof Error ? e.message : 'unknown',
        }),
      ),
    )
}
