/**
 * Has a speaker actually CLAIMED their complimentary ticket?
 *
 * Two different records have to be joined to answer that, and neither one can
 * answer it alone:
 *
 *  - `talk.issuedSpeakerTickets[]` proves the invitation was SENT. It is written
 *    by `@/lib/events/handlers/speakerTicket` after the provider invitation and
 *    the heads-up email go out, before the speaker does anything, so it never
 *    says whether the ticket was redeemed.
 *  - The provider's ticket list proves REDEMPTION: a ticket whose `crm.email` is
 *    one of the speaker's addresses and whose category is the speaker-ticket
 *    category. That is the only place a claim is recorded.
 *
 * NARROW ON PURPOSE: a speaker who bought an ordinary ticket is NOT redeemed.
 * The unused comp is exactly the thing an organizer is chasing, so widening the
 * category match would hide it.
 */
import { normalizeEmail } from '@/lib/speaker/email'
import {
  resolveTicketingProvider,
  type ConferenceTicketingBinding,
} from '@/lib/tickets/provider'
import type { EventTicket } from '@/lib/tickets/types'

/**
 * The provider category a complimentary speaker ticket is sold under. Same
 * literal as `@/lib/workshop/eligibility` and the ticket-sold webhook; it is the
 * convention of the Checkin events this platform runs.
 */
export const SPEAKER_TICKET_CATEGORY = 'Speaker ticket'

export type SpeakerTicketState =
  /** A speaker-category ticket exists for one of their addresses. */
  | 'redeemed'
  /** The invitation was sent; no speaker-category ticket has appeared. */
  | 'invited'
  /** No invitation has ever been sent — the common state, not an error. */
  | 'not-invited'
  /** The provider could not be reached or is not configured. NOT unredeemed. */
  | 'unknown'

export interface SpeakerTicketInput {
  speakerId: string
  /**
   * EVERY address the speaker is known by — display `email`, verified
   * `knownEmails`, and the `issuedSpeakerTickets[].email` snapshot (they may
   * have been invited at an address that is no longer their display one).
   */
  emails: (string | null | undefined)[]
  /** `issuedSpeakerTickets[].emailedAt`; absent ⇒ never invited. */
  invitedAt?: string | null
}

export interface SpeakerTicketStatus {
  speakerId: string
  state: SpeakerTicketState
  /** ISO timestamp of the invitation, when there was one. */
  invitedAt?: string
}

/**
 * The normalized addresses that hold a speaker-category ticket.
 *
 * `crm.email` is typed `string` but the provider does hand back tickets with no
 * contact email; `normalizeEmail` null-guards, and the empty result is dropped
 * so a speaker with a blank address can never match a blank ticket.
 */
export function redeemedSpeakerEmails(tickets: EventTicket[]): Set<string> {
  const emails = new Set<string>()
  for (const ticket of tickets) {
    if (ticket.category !== SPEAKER_TICKET_CATEGORY) continue
    const email = normalizeEmail(ticket.crm?.email)
    if (email) emails.add(email)
  }
  return emails
}

/**
 * Join speakers against the redeemed set. `redeemed === null` means the provider
 * could not answer — every speaker is then `unknown`, never `invited`: an outage
 * must not read as a hundred people who failed to claim.
 */
export function joinSpeakerTicketStatus(
  speakers: SpeakerTicketInput[],
  redeemed: Set<string> | null,
): SpeakerTicketStatus[] {
  return speakers.map((speaker) => {
    const invitedAt = speaker.invitedAt ?? undefined
    if (!redeemed) {
      return { speakerId: speaker.speakerId, state: 'unknown', invitedAt }
    }
    const hasTicket = speaker.emails.some((email) => {
      const normalized = normalizeEmail(email)
      return normalized !== '' && redeemed.has(normalized)
    })
    return {
      speakerId: speaker.speakerId,
      state: hasTicket ? 'redeemed' : invitedAt ? 'invited' : 'not-invited',
      invitedAt,
    }
  })
}

/**
 * A 30-second in-process memo over the FULL-EVENT ticket fetch, following the
 * `orderIdsForEvent` precedent in `@/server/routers/tickets`.
 *
 * `fetchEventTickets` is one uncached ~10s request for the whole event with no
 * retry, and this status is read on every render of `/admin/speakers`. The TTL
 * is short because it is a rate limiter, not a data cache: a ticket claimed
 * inside the window shows up one refresh later.
 *
 * KEYED ON `orgId` TOO. Checkin customer/event ids are only unique within an
 * account, so two orgs with their own accounts can legitimately hold the same
 * pair; the org id is the account discriminator and is not a secret.
 */
const TICKETS_TTL_MS = 30_000
const redeemedCache = new Map<
  string,
  { expiresAt: number; emails: Promise<Set<string>> }
>()

/** Test seam: drop the memo so a case cannot inherit another's fetch. */
export function __resetRedeemedCache() {
  redeemedCache.clear()
}

/**
 * The redeemed set for a conference, or `null` when the provider is
 * unconfigured, uncredentialed or failing. Never throws: every caller renders
 * `unknown` from `null` rather than an error page.
 */
export async function fetchRedeemedSpeakerEmails(
  conference: ConferenceTicketingBinding,
): Promise<Set<string> | null> {
  const orgId = conference.organization?._ref
  // Fail closed: without an owning org there is no account to key the memo on,
  // and `resolveTicketingCredentials` would decline anyway.
  if (!orgId) return null

  try {
    const ticketing = await resolveTicketingProvider(conference)
    if (!ticketing.configured) return null

    const key = `${orgId}:${JSON.stringify(ticketing.eventRef)}`
    const now = Date.now()
    const cached = redeemedCache.get(key)
    if (cached && cached.expiresAt > now) return await cached.emails

    const emails = ticketing.provider
      .fetchEventTickets(ticketing.eventRef)
      .then(redeemedSpeakerEmails)
    // A failed fetch must not be served for the rest of the window — but evict
    // only if THIS promise is still the entry. A rejection arriving after the
    // TTL lapsed would otherwise delete a newer in-flight fetch installed under
    // the same key, and every concurrent caller would issue its own.
    emails.catch(() => {
      if (redeemedCache.get(key)?.emails === emails) redeemedCache.delete(key)
    })
    redeemedCache.set(key, { expiresAt: now + TICKETS_TTL_MS, emails })
    // Keep a long-lived warm instance from growing an entry per event forever.
    for (const [k, entry] of redeemedCache) {
      if (entry.expiresAt <= now) redeemedCache.delete(k)
    }
    return await emails
  } catch (error) {
    console.error('[speakerTicketStatus] provider read failed', error)
    return null
  }
}
