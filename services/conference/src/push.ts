// Web push (kontroll#61): hand the event to identity's `Push` entrypoint,
// which resolves recipients and sends. Fire and forget: the call runs after
// the response via waitUntil and can never fail the write that raised it.
// `cloudflare:workers` is imported lazily: api/scripts/compose.ts loads the
// subgraph schema under Node, where the module does not exist.
export type ConferencePushEvent =
  | {
      type: 'conference.settings_changed'
      organizationId: string
      conferenceId: string
      conferenceName: string | null
      actorId: string
    }
  | { type: 'parity.drift'; conferenceIds: string[] }

export interface PushBinding {
  send(event: ConferencePushEvent): Promise<void>
}

const failed = (event: ConferencePushEvent) => (e: unknown) =>
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
