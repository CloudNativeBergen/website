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
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import {
  apiHostForConference,
  fetchApiSpeakerProfile,
  fetchApiSpeakers,
} from '@/lib/konf-api/program'
import { listPublicTalks } from '@/lib/proposal/server'
import { toPublicTalk, type PublicTalk } from '@/lib/proposal/public'
import type { SpeakerWithProposals } from './index'
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
  // apiRead tenants read through the gateway (#1772), speaker and talks in one
  // root; any failure is Sanity. The API strips scheduleInfo before
  // programDate, the same rule the page applies (withoutUnpublishedSchedule).
  const host = await apiHostForConference(conferenceId)
  if (host) {
    try {
      const p = await fetchApiSpeakerProfile(host, conferenceId, slug)
      if (!p) return { speaker: null, talks: [], err: null }
      return {
        speaker: p.speaker as unknown as PublicSpeaker,
        talks: p.talks.map(toPublicTalk),
        err: null,
      }
    } catch (err) {
      console.warn(
        `[konf-api] profile falling back to Sanity for ${conferenceId}:`,
        (err as Error).message,
      )
    }
  }
  const { speaker, err } = await store.getPublicSpeaker(conferenceId, slug)
  if (!speaker) return { speaker: null, talks: [], err: err as Error | null }
  const { _id: speakerId, ...publicSpeaker } = speaker
  const talks = await listPublicTalks(conferenceId, { speakerId })
  return { speaker: publicSpeaker, talks: talks.talks, err: talks.err }
}

/**
 * The public /speaker list and the sitemap: speakers with a confirmed talk in
 * `conferenceId`. getSpeakers(conferenceId) on Sanity, or the gateway for an
 * apiRead tenant (#1772), with the fields those two pages use. Every other
 * getSpeakers caller (admin, tickets, status, dashboard) stays on Sanity.
 */
export async function getPublicSpeakers(conferenceId: string): Promise<{
  speakers: SpeakerWithProposals[]
  err: Error | null
}> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:speakers')
  cacheTag(conferenceTag(conferenceId))
  const host = await apiHostForConference(conferenceId)
  if (host) {
    try {
      const speakers = await fetchApiSpeakers(host, conferenceId)
      return {
        speakers: speakers as unknown as SpeakerWithProposals[],
        err: null,
      }
    } catch (err) {
      console.warn(
        `[konf-api] speakers falling back to Sanity for ${conferenceId}:`,
        (err as Error).message,
      )
    }
  }
  return store.getSpeakers(conferenceId)
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
 * Append a ticket grant. Writes ONLY `ticketEmailGrants`: ticket joins read
 * `ticketEmailGrants[].email`, and a grant must never become a login key
 * (#1914). APPEND, not set, so two organizers granting at once never drop each
 * other's entry. One `append` per patch: `@sanity/client` keeps only the last
 * insert when a Patch chains two.
 */
export async function addSpeakerTicketEmail(
  speakerId: string,
  grant: TicketEmailGrant & { _key: string },
): Promise<void> {
  await clientWrite
    .patch(speakerId)
    .setIfMissing({ ticketEmailGrants: [] })
    .append('ticketEmailGrants', [grant])
    .commit()
}

/**
 * Remove a granted ticket address from `ticketEmailGrants`. Unsets by predicate
 * when `email` is safe in a selector literal; otherwise rewrites the array from
 * the read `grants` (correct, but can lose a concurrent edit).
 */
export async function removeSpeakerTicketEmail(
  speakerId: string,
  email: string,
  grants: TicketEmailGrant[],
): Promise<void> {
  const patch = clientWrite.patch(speakerId)
  await (
    /^[a-z0-9!#$%&'*+/=?^_`{|}~.@-]+$/.test(email)
      ? patch.unset([`ticketEmailGrants[email == "${email}"]`])
      : patch.set({
          ticketEmailGrants: grants.filter(
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
