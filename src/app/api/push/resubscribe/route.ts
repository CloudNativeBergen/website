import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { addPushSubscription, removePushSubscription } from '@/lib/push/sanity'

/**
 * Re-subscription endpoint for the service worker `pushsubscriptionchange`
 * handler (issue #444). When a browser rotates a push subscription, the SW
 * re-subscribes and POSTs the new subscription here so delivery keeps working.
 *
 * SECURITY: the write is bound to the authenticated session's own speaker
 * (`session.speaker._id`); the body never carries a speaker id. Unauthenticated
 * callers are rejected. This mirrors the tRPC `push.subscribe` guarantees for
 * the one place the SW can't use the tRPC client.
 */

const BodySchema = z.object({
  oldEndpoint: z.string().url().optional(),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
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

    const parsed = BodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { oldEndpoint, subscription } = parsed.data

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
