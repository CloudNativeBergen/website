import 'server-only'
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
 *
 * CONCURRENCY: mutations use ATOMIC Sanity patches (`unset` by endpoint,
 * `insert` after the tail) rather than read-modify-write of the whole array, so
 * two devices subscribing/unsubscribing at once can't clobber each other's
 * writes and a prune can never resurrect a rotated endpoint. Each new record is
 * minted with a stable `_key` exactly once; existing records keep their keys.
 */

/** Hard cap on stored subscriptions per speaker (oldest evicted on overflow). */
export const MAX_SUBSCRIPTIONS_PER_SPEAKER = 20

/**
 * Escape a string for safe interpolation into a GROQ filter double-quoted
 * literal. Endpoints are already constrained to plain https URLs by
 * `isValidPushEndpoint` (no quotes survive URL parsing), but we escape `\` and
 * `"` defensively so the `pushSubscriptions[endpoint=="…"]` selector can never
 * be broken out of.
 */
function escapeGroqString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** The GROQ array selector matching the stored subscription with `endpoint`. */
function endpointSelector(endpoint: string): string {
  return `pushSubscriptions[endpoint=="${escapeGroqString(endpoint)}"]`
}

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
 * Store a subscription on the speaker doc, de-duplicated by `endpoint`: any
 * existing record for the same endpoint is dropped (its keys may have rotated)
 * and the fresh record appended, in ONE atomic transaction. Enforces a
 * per-speaker device cap by evicting the oldest record(s) first when full.
 *
 * The dedup + cap decisions need a read, but the actual writes are atomic
 * unset/insert patches keyed by endpoint (not a whole-array `.set()`), so a
 * concurrent add/remove for a *different* endpoint can't be lost.
 */
export async function addPushSubscription(
  speakerId: string,
  record: Omit<PushSubscriptionRecord, 'createdAt'> & { createdAt?: string },
): Promise<void> {
  const { subscriptions } = await getSpeakerPushState(speakerId)

  // Endpoints to remove in the same transaction: the incoming endpoint (dedup),
  // plus the oldest overflow entries so that after inserting we stay at or below
  // the cap. `others` excludes the incoming endpoint (it's being re-added).
  const others = subscriptions.filter((s) => s.endpoint !== record.endpoint)
  const evict = new Set<string>()
  const overflow = others.length - (MAX_SUBSCRIPTIONS_PER_SPEAKER - 1)
  if (overflow > 0) {
    const oldestFirst = [...others].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    )
    for (const s of oldestFirst.slice(0, overflow)) evict.add(s.endpoint)
  }

  const item = {
    _key: generateKey('push'),
    endpoint: record.endpoint,
    keys: { p256dh: record.keys.p256dh, auth: record.keys.auth },
    createdAt: record.createdAt ?? new Date().toISOString(),
    ...(record.userAgent ? { userAgent: record.userAgent } : {}),
  }

  const unsetPaths = [
    endpointSelector(record.endpoint),
    ...Array.from(evict).map(endpointSelector),
  ]

  // Two patches in one transaction: (1) remove the incoming endpoint (dedup) and
  // any evicted overflow; (2) ensure the array exists and append the new record.
  // Splitting the unset and insert into separate patches guarantees the removal
  // is applied before the insert, so the just-inserted record is never matched
  // by the dedup selector.
  await clientWrite
    .transaction()
    .patch(speakerId, (patch) => patch.unset(unsetPaths))
    .patch(speakerId, (patch) =>
      patch
        .setIfMissing({ pushSubscriptions: [] })
        .insert('after', 'pushSubscriptions[-1]', [item]),
    )
    .commit()
}

/** Remove the subscription with the given endpoint, if present (atomic). */
export async function removePushSubscription(
  speakerId: string,
  endpoint: string,
): Promise<void> {
  await clientWrite
    .patch(speakerId)
    .unset([endpointSelector(endpoint)])
    .commit()
}

/**
 * Prune a dead subscription after a 404/410 from the push service. Thin wrapper
 * over {@link removePushSubscription}, named separately to document intent at
 * call sites in the send path. Atomic unset by endpoint, so it can never
 * resurrect a subscription that was rotated in between the send and the prune.
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

export { DEFAULT_PUSH_PREFERENCES }
