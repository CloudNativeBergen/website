import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { generateKey } from '@/lib/sanity/helpers'
import {
  type PushPreferences,
  type PushSubscriptionRecord,
  type SpeakerPushState,
  DEFAULT_PUSH_PREFERENCES,
  normalizePushPreferences,
} from './types'

/**
 * Sanity persistence for speaker push subscriptions + preferences (issue #444).
 *
 * SECURITY: every function here is keyed by a caller-supplied `speakerId`, but
 * the tRPC layer ALWAYS passes `ctx.speaker._id` — never a client-supplied id —
 * so a caller can only ever read/write their own subscriptions. Do not add a
 * code path that takes the speaker id from request input.
 */

interface StoredSubscription {
  _key?: string
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
  createdAt?: string
  userAgent?: string
}

/** Read the current push state (subscriptions + normalised preferences). */
export async function getSpeakerPushState(
  speakerId: string,
): Promise<SpeakerPushState> {
  const result = await clientReadUncached.fetch<{
    pushSubscriptions?: StoredSubscription[]
    pushPreferences?: Partial<PushPreferences>
  } | null>(
    groq`*[_type == "speaker" && _id == $speakerId][0]{
      pushSubscriptions,
      pushPreferences
    }`,
    { speakerId },
    { cache: 'no-store' },
  )

  return {
    subscriptions: normalizeSubscriptions(result?.pushSubscriptions),
    preferences: normalizePushPreferences(result?.pushPreferences),
  }
}

function normalizeSubscriptions(
  raw: StoredSubscription[] | undefined,
): PushSubscriptionRecord[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (s): s is StoredSubscription =>
        Boolean(s?.endpoint) &&
        Boolean(s?.keys?.p256dh) &&
        Boolean(s?.keys?.auth),
    )
    .map((s) => ({
      endpoint: s.endpoint as string,
      keys: {
        p256dh: s.keys!.p256dh as string,
        auth: s.keys!.auth as string,
      },
      createdAt: s.createdAt ?? new Date().toISOString(),
      userAgent: s.userAgent,
    }))
}

/**
 * Store a subscription on the speaker doc, de-duplicated by `endpoint`: an
 * existing record for the same endpoint is replaced (its keys may have rotated)
 * rather than duplicated. Read-modify-write so the dedup is authoritative.
 */
export async function addPushSubscription(
  speakerId: string,
  record: Omit<PushSubscriptionRecord, 'createdAt'> & { createdAt?: string },
): Promise<void> {
  const { subscriptions } = await getSpeakerPushState(speakerId)
  const others = subscriptions.filter((s) => s.endpoint !== record.endpoint)

  const next = [
    ...others.map(toStored),
    {
      _key: generateKey('push'),
      endpoint: record.endpoint,
      keys: { p256dh: record.keys.p256dh, auth: record.keys.auth },
      createdAt: record.createdAt ?? new Date().toISOString(),
      ...(record.userAgent ? { userAgent: record.userAgent } : {}),
    },
  ]

  await clientWrite.patch(speakerId).set({ pushSubscriptions: next }).commit()
}

/** Remove the subscription with the given endpoint, if present. */
export async function removePushSubscription(
  speakerId: string,
  endpoint: string,
): Promise<void> {
  const { subscriptions } = await getSpeakerPushState(speakerId)
  const next = subscriptions
    .filter((s) => s.endpoint !== endpoint)
    .map(toStored)

  await clientWrite.patch(speakerId).set({ pushSubscriptions: next }).commit()
}

/**
 * Prune a dead subscription after a 404/410 from the push service. Thin wrapper
 * over {@link removePushSubscription}, named separately to document intent at
 * call sites in the send path.
 */
export async function prunePushSubscription(
  speakerId: string,
  endpoint: string,
): Promise<void> {
  await removePushSubscription(speakerId, endpoint)
}

/** Read the speaker's normalised push preferences. */
export async function getPushPreferences(
  speakerId: string,
): Promise<PushPreferences> {
  const { preferences } = await getSpeakerPushState(speakerId)
  return preferences
}

/** Overwrite the speaker's push preferences with a complete, normalised set. */
export async function setPushPreferences(
  speakerId: string,
  preferences: PushPreferences,
): Promise<PushPreferences> {
  const normalized = normalizePushPreferences(preferences)
  await clientWrite
    .patch(speakerId)
    .set({ pushPreferences: normalized })
    .commit()
  return normalized
}

/** Re-key a normalised record for storage (a fresh `_key` per Sanity array). */
function toStored(record: PushSubscriptionRecord): StoredSubscription {
  return {
    _key: generateKey('push'),
    endpoint: record.endpoint,
    keys: { p256dh: record.keys.p256dh, auth: record.keys.auth },
    createdAt: record.createdAt,
    ...(record.userAgent ? { userAgent: record.userAgent } : {}),
  }
}

export { DEFAULT_PUSH_PREFERENCES }
