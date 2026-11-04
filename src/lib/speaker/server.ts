/**
 * Server-only half of the speaker seam (#1772, #1897). Mirrors
 * `@/lib/proposal/server`: functions that need another server-only seam, or
 * write, live here so `@/lib/speaker` (`./index`) stays importable from the
 * module chains that reach it today (e.g. gallery/events, which Storybook
 * loads through conference/sanity).
 */
import 'server-only'
import type { Transaction } from '@sanity/client'
import { clientWrite } from '@/lib/sanity/client'
import { listPublicTalks } from '@/lib/proposal/server'
import type { PublicTalk } from '@/lib/proposal/public'
import * as store from './sanity'
import { canonicalEmail, normalizeEmail } from './email'
import type { Speaker, TicketEmailGrant } from './types'
import type { PushPreferences } from '@/lib/push/types'

/** A speaker's public profile in one conference. */
export type PublicSpeaker = Pick<
  Speaker,
  'name' | 'title' | 'bio' | 'links' | 'flags' | 'image' | 'galleryImages'
> & {
  /** Not projected by the Sanity read today, so always undefined there. */
  slug?: string
}

export interface PublicSpeakerProfile {
  speaker: PublicSpeaker | null
  /** Confirmed talks in the conference, from the proposal seam. */
  talks: PublicTalk[]
  err: Error | null
}

/**
 * The public profile of the speaker at `slug`, or `speaker: null` when no
 * speaker with a confirmed talk in `conferenceId` has that slug.
 */
export async function getPublicSpeakerProfile(
  conferenceId: string,
  slug: string,
): Promise<PublicSpeakerProfile> {
  const { speaker, err } = await store.getPublicSpeaker(conferenceId, slug)
  if (!speaker) return { speaker: null, talks: [], err: err as Error | null }
  const { _id: speakerId, ...publicSpeaker } = speaker
  const talks = await listPublicTalks(conferenceId, { speakerId })
  return { speaker: publicSpeaker, talks: talks.talks, err: talks.err }
}

/** What an organizer supplies to create a speaker placeholder in `orgId`. */
export type CreateSpeakerInput = store.OrganizerCreatedSpeakerFields & {
  orgId: string
}

/**
 * Create an organizer-made speaker placeholder (see
 * `buildOrganizerCreatedSpeaker` for the shape and what it must never carry).
 * Commits on its own, unless `options.transaction` is given: then the create is
 * queued on it with `options.id` and the caller commits.
 */
export async function createSpeaker(
  { orgId, ...fields }: CreateSpeakerInput,
  options: { id: string; transaction: Transaction } | { id?: string } = {},
): Promise<{ id: string }> {
  const document = await store.buildOrganizerCreatedSpeaker(fields, orgId)
  const doc = options.id ? { _id: options.id, ...document } : document
  if ('transaction' in options && options.transaction) {
    // The type requires the id; this guards untyped callers.
    if (!options.id) throw new Error('createSpeaker: transaction needs an id')
    options.transaction.create(doc as typeof document & { _id: string })
    return { id: options.id }
  }
  const created = await clientWrite.create(doc)
  return { id: created._id }
}

/** Delete a speaker document. Callers check ownership first. */
export async function deleteSpeaker(speakerId: string): Promise<void> {
  await clientWrite.delete(speakerId)
}

/** Set a speaker's display email, canonicalized (see `updateProfileEmail`). */
export async function updateSpeakerEmail(
  speakerId: string,
  email: string,
): Promise<void> {
  await clientWrite
    .patch(speakerId)
    .set({ email: canonicalEmail(email) })
    .commit()
}

/**
 * Append a ticket address and its grant in one patch. APPEND, not set, so two
 * organizers granting at once never drop each other's entry.
 */
export async function addSpeakerTicketEmail(
  speakerId: string,
  grant: TicketEmailGrant & { _key: string },
): Promise<void> {
  await clientWrite
    .patch(speakerId)
    .setIfMissing({ knownEmails: [], ticketEmailGrants: [] })
    .append('knownEmails', [grant.email])
    .append('ticketEmailGrants', [grant])
    .commit()
}

/**
 * Remove a granted ticket address from `knownEmails` and `ticketEmailGrants`.
 * Unsets by predicate when `email` is safe in a selector literal; otherwise
 * rewrites both arrays from the read `state` (correct, but can lose a
 * concurrent edit).
 */
export async function removeSpeakerTicketEmail(
  speakerId: string,
  email: string,
  state: { knownEmails: string[]; grants: TicketEmailGrant[] },
): Promise<void> {
  const patch = clientWrite.patch(speakerId)
  await (
    /^[a-z0-9!#$%&'*+/=?^_`{|}~.@-]+$/.test(email)
      ? patch.unset([
          `knownEmails[@ == "${email}"]`,
          `ticketEmailGrants[email == "${email}"]`,
        ])
      : patch.set({
          knownEmails: state.knownEmails.filter((held) => held !== email),
          ticketEmailGrants: state.grants.filter(
            (grant) => normalizeEmail(grant.email) !== email,
          ),
        })
  ).commit()
}

/**
 * Queue appending `orgId` to a speaker's `organizations` on `transaction`; the
 * caller commits. Unconditional: callers ensure the membership is new.
 */
export function addSpeakerOrganization(
  speakerId: string,
  orgId: string,
  options: { transaction: Transaction },
): void {
  options.transaction.patch(speakerId, (p) =>
    p
      .setIfMissing({ organizations: [] })
      .insert('after', 'organizations[-1]', [
        { _type: 'reference', _ref: orgId, _key: orgId },
      ]),
  )
}

/**
 * Escape a string for a GROQ double-quoted literal. Endpoints are already
 * plain https URLs (`isValidPushEndpoint`); `\` and `"` are escaped
 * defensively so the selector can never be broken out of.
 */
function escapeGroqString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function pushEndpointSelector(endpoint: string): string {
  return `pushSubscriptions[endpoint=="${escapeGroqString(endpoint)}"]`
}

/** A push subscription as stored on the speaker document. */
export interface StoredPushSubscription {
  _key: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  createdAt: string
  userAgent?: string
}

/**
 * In ONE transaction: unset the subscriptions at `removeEndpoints`, then
 * append `item`. Two patches so the unset applies before the insert and the
 * new record is never matched by its own dedup selector.
 */
export async function replaceSpeakerPushSubscriptions(
  speakerId: string,
  removeEndpoints: string[],
  item: StoredPushSubscription,
): Promise<void> {
  await clientWrite
    .transaction()
    .patch(speakerId, (patch) =>
      patch.unset(removeEndpoints.map(pushEndpointSelector)),
    )
    .patch(speakerId, (patch) =>
      patch
        .setIfMissing({ pushSubscriptions: [] })
        .insert('after', 'pushSubscriptions[-1]', [item]),
    )
    .commit()
}

/** Unset the push subscription with `endpoint`, if present (atomic). */
export async function removeSpeakerPushSubscription(
  speakerId: string,
  endpoint: string,
): Promise<void> {
  await clientWrite
    .patch(speakerId)
    .unset([pushEndpointSelector(endpoint)])
    .commit()
}

/** Overwrite a speaker's push preferences. Callers normalise first. */
export async function setSpeakerPushPreferences(
  speakerId: string,
  preferences: PushPreferences,
): Promise<void> {
  await clientWrite
    .patch(speakerId)
    .set({ pushPreferences: preferences })
    .commit()
}
