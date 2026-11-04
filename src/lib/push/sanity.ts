import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import {
  removeSpeakerPushSubscription,
  replaceSpeakerPushSubscriptions,
  setSpeakerPushPreferences,
} from '@/lib/speaker/server'
import { groq } from 'next-sanity'
import { generateKey } from '@/lib/sanity/helpers'
import {
  type PushPreferences,
  type PushSubscriptionRecord,
  type SpeakerPushState,
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
    // groq-global-scoped: a point read of the CALLER'S OWN speaker document —
    // the tRPC layer always passes `ctx.speaker._id`, never client input (see
    // the module header), and `speaker` carries no tenant ref of its own (a
    // person may belong to several orgs). Same mechanism as
    // `getSpeakerPushStates` below.
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

/**
 * Read the push state of MANY speakers in ONE query, keyed by speaker id.
 *
 * WHY IT EXISTS (Sanity request budget). The hub → push bridge called
 * {@link getSpeakerPushState} once per recipient inside its fan-out, so a
 * 200-recipient announcement cost 200 reads before a single push was sent. This
 * is the same projection, once.
 *
 * A speaker id with no document is simply ABSENT from the map. That is the same
 * outcome the per-speaker read produced (no subscriptions ⇒ nothing to deliver),
 * expressed as absence rather than an empty record, so a caller cannot confuse
 * "no such speaker" with "speaker with no devices" if it ever needs to.
 */
export async function getSpeakerPushStates(
  speakerIds: string[],
): Promise<Map<string, SpeakerPushState>> {
  const states = new Map<string, SpeakerPushState>()
  const unique = Array.from(new Set(speakerIds.filter(Boolean)))
  if (unique.length === 0) return states

  // groq-global-scoped: a point read of speakers BY ID, where the ids are the
  // recipients of notification documents this server just wrote — never client
  // input. Identical in kind to `getSpeakerPushState` above, batched. `speaker`
  // carries no tenant ref of its own (a person may belong to several orgs), so
  // there is no tenant predicate to add.
  const query = groq`*[_type == "speaker" && _id in $speakerIds]{
      _id,
      pushSubscriptions,
      pushPreferences
    }`
  const rows = await clientReadUncached.fetch<
    {
      _id: string
      pushSubscriptions?: StoredSubscription[]
      pushPreferences?: Partial<PushPreferences>
    }[]
  >(query, { speakerIds: unique }, { cache: 'no-store' })

  for (const row of rows ?? []) {
    if (!row?._id) continue
    states.set(row._id, {
      subscriptions: normalizeSubscriptions(row.pushSubscriptions),
      preferences: normalizePushPreferences(row.pushPreferences),
    })
  }
  return states
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

  // The dedup + eviction unset and the append ride ONE transaction (see seam).
  await replaceSpeakerPushSubscriptions(
    speakerId,
    [record.endpoint, ...Array.from(evict)],
    item,
  )
}

/** Remove the subscription with the given endpoint, if present (atomic). */
export async function removePushSubscription(
  speakerId: string,
  endpoint: string,
): Promise<void> {
  await removeSpeakerPushSubscription(speakerId, endpoint)
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
  await setSpeakerPushPreferences(speakerId, normalized)
  return normalized
}
