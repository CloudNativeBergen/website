import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { addPushSubscription, removePushSubscription } from '@/lib/push/sanity'
import { PushEndpointSchema, MAX_PUSH_KEY_LENGTH } from '@/lib/push/validate'

/**
 * Re-subscription endpoint for the service worker `pushsubscriptionchange`
 * handler (issue #444). When a browser rotates a push subscription, the SW
 * re-subscribes and POSTs the new subscription here so delivery keeps working.
 *
 * SECURITY: the write is bound to the authenticated session's own speaker
 * (`session.speaker._id`); the body never carries a speaker id. Unauthenticated
 * callers are rejected. This mirrors the tRPC `push.subscribe` guarantees for
 * the one place the SW can't use the tRPC client. Additional hardening:
 *   - requires `Content-Type: application/json` (415 otherwise);
 *   - when an `Origin` header is present it must match the request host (403);
 *   - a malformed JSON body is a 400 (client error), not a 500;
 *   - the endpoint is validated by the shared SSRF guard and keys are capped;
 *   - writes go through the ATOMIC Sanity helpers.
 */

const BodySchema = z.object({
  oldEndpoint: PushEndpointSchema.optional(),
  subscription: z.object({
    endpoint: PushEndpointSchema,
    keys: z.object({
      p256dh: z.string().min(1).max(MAX_PUSH_KEY_LENGTH),
      auth: z.string().min(1).max(MAX_PUSH_KEY_LENGTH),
    }),
  }),
})

export async function POST(request: Request) {
  try {
    const session = await getAuthSession({ headers: request.headers })
    const speakerId = session?.speaker?._id
    if (!speakerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Require a JSON content type — this is only ever called by our own SW with
    // a JSON body; anything else is rejected before we touch the body.
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { error: 'Unsupported Media Type' },
        { status: 415 },
      )
    }

    // When the browser sends an Origin header it must match the request host
    // (the SW posts same-origin). A cross-origin Origin is refused.
    const originHeader = request.headers.get('origin')
    if (originHeader) {
      const host =
        request.headers.get('x-forwarded-host') ?? request.headers.get('host')
      let originHost: string | null = null
      try {
        originHost = new URL(originHeader).host
      } catch {
        originHost = null
      }
      if (!host || !originHost || originHost !== host) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Malformed JSON is a client error (400), not a server error (500).
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = BodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { oldEndpoint, subscription } = parsed.data

    // Atomic helpers: unset the rotated endpoint, then dedup-insert the new one.
    if (oldEndpoint && oldEndpoint !== subscription.endpoint) {
      await removePushSubscription(speakerId, oldEndpoint)
    }
    await addPushSubscription(speakerId, {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent: request.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to process push re-subscription:', error)
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 },
    )
  }
}
