// Signed push webhook events (RunKonf/kontroll#61). Workers POST
// `{type, ...ids}` to PUSH_WEBHOOK_URL; kontroll resolves recipients and sends
// the web push. Ids and the event type only, never names or emails.
//
// Headers: x-konf-timestamp (unix seconds) and x-konf-signature, the hex
// HMAC-SHA256 of `${timestamp}.${body}` keyed with PUSH_WEBHOOK_SECRET. The
// receiver recomputes it over the raw body, compares in constant time, and
// rejects a timestamp more than 5 minutes from its own clock (replay window).

export type PushEvent =
  | {
      type: 'member.invited'
      organizationId: string
      invitationId: string
      actorId: string
    }
  | {
      type: 'invite.accepted'
      organizationId: string
      invitationId: string
      userId: string
    }
  | {
      type: 'member.role_changed'
      organizationId: string
      userId: string
      /** null only if the session is missing, which the route refuses. */
      actorId: string | null
    }
  | {
      type: 'conference.settings_changed'
      organizationId: string
      conferenceId: string
      actorId: string
    }
  | { type: 'parity.drift'; conferenceIds: string[] }
  | { type: 'membership.drift'; organizationId: string }

export interface PushEnv {
  /** var: https://my.konf.app/api/push/events in production */
  PUSH_WEBHOOK_URL?: string
  /** wrangler secret put PUSH_WEBHOOK_SECRET (per environment) */
  PUSH_WEBHOOK_SECRET?: string
}

export async function signPush(
  secret: string,
  timestamp: string,
  body: string,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  )
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Never rejects: a failed or unconfigured send is logged and dropped, so the
 * caller can hand it to waitUntil without risking the business write.
 */
export async function pushEvent(env: PushEnv, event: PushEvent): Promise<void> {
  try {
    if (!env.PUSH_WEBHOOK_URL || !env.PUSH_WEBHOOK_SECRET) return
    const body = JSON.stringify(event)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const res = await fetch(env.PUSH_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-konf-timestamp': timestamp,
        'x-konf-signature': await signPush(
          env.PUSH_WEBHOOK_SECRET,
          timestamp,
          body,
        ),
      },
      body,
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'push.webhook_failed',
        type: event.type,
        error: e instanceof Error ? e.message : 'unknown',
      }),
    )
  }
}
