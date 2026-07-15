/**
 * Web push notification domain types (issue #444).
 *
 * Speakers opt in to browser push notifications; their subscriptions and
 * per-category preferences are stored ON the speaker Sanity document. Nothing
 * here is anonymous — every subscription is bound to a single speaker `_id`.
 */

/** The notification categories a speaker can independently toggle. */
export const PUSH_CATEGORIES = [
  'proposalDecisions',
  'talkConfirmed',
  'coSpeakerInvites',
] as const

export type PushCategory = (typeof PUSH_CATEGORIES)[number]

/** Per-category on/off switches. All default ON (see DEFAULT_PUSH_PREFERENCES). */
export interface PushPreferences {
  /** Accepted / rejected / waitlisted decisions on a proposal. */
  proposalDecisions: boolean
  /** A talk being confirmed for the programme. */
  talkConfirmed: boolean
  /** Being invited as a co-speaker on someone else's proposal. */
  coSpeakerInvites: boolean
}

/**
 * Defaults: a speaker who has opted into push at all wants every category
 * until they say otherwise.
 */
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  proposalDecisions: true,
  talkConfirmed: true,
  coSpeakerInvites: true,
}

/** The encryption keys the browser hands us for a PushSubscription. */
export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

/**
 * A single stored push subscription. Mirrors the browser `PushSubscription`
 * JSON shape (`endpoint` + `keys`) plus bookkeeping. `endpoint` is the unique
 * dedup key: a browser/profile has exactly one endpoint per push service.
 */
export interface PushSubscriptionRecord {
  endpoint: string
  keys: PushSubscriptionKeys
  /** ISO-8601 timestamp of when the subscription was stored. */
  createdAt: string
  /** Best-effort UA string, purely to help a speaker recognise a device. */
  userAgent?: string
}

/** The push-related state read back off a speaker document. */
export interface SpeakerPushState {
  subscriptions: PushSubscriptionRecord[]
  preferences: PushPreferences
}

/**
 * The JSON payload delivered to the service worker `push` handler. Deliberately
 * minimal and self-contained: it only ever carries what the recipient is
 * already entitled to see (a title, a short body, and a same-origin deep link).
 */
export interface PushMessagePayload {
  title: string
  body: string
  /** Same-origin path the notification click should open, e.g. `/cfp/list`. */
  url: string
  /** Optional category tag, used to collapse/replace prior notifications. */
  tag?: string
}

/** Normalises an arbitrary stored value into a complete PushPreferences. */
export function normalizePushPreferences(
  value: Partial<PushPreferences> | null | undefined,
): PushPreferences {
  return {
    proposalDecisions:
      value?.proposalDecisions ?? DEFAULT_PUSH_PREFERENCES.proposalDecisions,
    talkConfirmed:
      value?.talkConfirmed ?? DEFAULT_PUSH_PREFERENCES.talkConfirmed,
    coSpeakerInvites:
      value?.coSpeakerInvites ?? DEFAULT_PUSH_PREFERENCES.coSpeakerInvites,
  }
}
