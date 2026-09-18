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
 *
 * WHICH CATEGORY COUNTS IS DERIVED, NOT ASSUMED. Issuance does not use a fixed
 * name: `@/lib/events/handlers/speakerTicket` finds the type with
 * `requiresInvitation && /speaker/i.test(name)`. A tenant whose invite-only type
 * is called "Speaker" therefore gets invitations sent and markers written while
 * every claimed ticket lands in a category a hard-coded `'Speaker ticket'`
 * comparison ignores — the whole programme would read Invited forever, and the
 * "not claimed" filter would list precisely the people who DID claim, with the
 * provider perfectly healthy and no `unknown` to warn anyone. So this module
 * resolves the category from the SAME source issuance uses, and refuses to
 * guess: a type it cannot identify yields `unknown`, never "not claimed".
 */
import { normalizeEmail } from '@/lib/speaker/email'
import {
  resolveTicketingProvider,
  type ConferenceTicketingBinding,
  type PublicTicketType,
  type ResolvedTicketing,
} from '@/lib/tickets/provider'
import type { EventTicket } from '@/lib/tickets/types'
import { SPEAKER_TICKET_CATEGORY } from './speakerTicketCategory'

export { SPEAKER_TICKET_CATEGORY } from './speakerTicketCategory'

/** Same rule issuance uses to pick the type it sends invitations for. */
export function findSpeakerTicketType<
  T extends { name: string; requiresInvitation: boolean },
>(types: T[]): T | undefined {
  return types.find((t) => t.requiresInvitation && /speaker/i.test(t.name))
}

/**
 * The speaker ticket type for an event, resolved AT MOST ONCE per 30 seconds.
 *
 * The type is a property of the CONFERENCE, not of a proposal — it cannot
 * differ between two talks at the same event. Issuance used to rediscover it
 * inside every per-proposal call, so a 36-talk sweep made 36 identical
 * `fetchPublicTicketTypes` round-trips, and the confirmation modal made 36 more
 * just to open (it dry-runs the same sweep).
 *
 * `findSpeakerTicketType` is still the ONLY definition of what counts. This
 * changes how often it is asked, never what it matches.
 *
 * `undefined` means "no identifiable speaker ticket type" and is memoized too:
 * every proposal in a sweep must get the same answer and abort the same way,
 * rather than one lookup failing and the rest silently skipping.
 *
 * A FAILED FETCH IS NOT CACHED — it rejects, the entry is evicted, and the
 * caller aborts. The memo holds the in-flight promise, so the proposals of one
 * sweep share a single round-trip instead of racing to make their own.
 *
 * KEYED ON `orgId` TOO, for the same reason every other ticketing cache here is:
 * Checkin customer/event ids are unique only within an account. With no owning
 * org there is no discriminator, so the lookup is simply not memoized rather
 * than risking a cross-account hit.
 */
const TICKET_TYPE_TTL_MS = 30_000
const ticketTypeCache = new Map<
  string,
  { expiresAt: number; type: Promise<PublicTicketType | undefined> }
>()

/** Test seam: drop the memo so a case cannot inherit another's lookup. */
export function __resetSpeakerTicketTypeCache() {
  ticketTypeCache.clear()
}

export function resolveSpeakerTicketType(
  ticketing: Extract<ResolvedTicketing, { configured: true }>,
  orgId?: string,
): Promise<PublicTicketType | undefined> {
  const lookup = () =>
    ticketing.provider
      .fetchPublicTicketTypes(ticketing.eventRef)
      .then(({ tickets }) => findSpeakerTicketType(tickets))

  if (!orgId) return lookup()

  const key = `${orgId}:${JSON.stringify(ticketing.eventRef)}`
  const now = Date.now()
  const cached = ticketTypeCache.get(key)
  if (cached && cached.expiresAt > now) return cached.type

  const type = lookup()
  type.catch(() => {
    if (ticketTypeCache.get(key)?.type === type) ticketTypeCache.delete(key)
  })
  ticketTypeCache.set(key, { expiresAt: now + TICKET_TYPE_TTL_MS, type })
  for (const [k, entry] of ticketTypeCache) {
    if (entry.expiresAt <= now) ticketTypeCache.delete(k)
  }
  return type
}

/** Category names compare case- and whitespace-insensitively, like issuance. */
const categoryKey = (name?: string | null) => (name ?? '').trim().toLowerCase()

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
 * THE ONLY TICKET FACTS THIS MODULE KEEPS: the ticket's own id, who it names,
 * the address it was bought under, and its category. `EventTicket` also carries
 * ORDER ids, sums and payment state; none of that helps identify a person's
 * ticket, so it is dropped HERE, at the fetch, rather than trusted to be
 * dropped at each endpoint.
 *
 * The organizer-facing search narrows this further still — see
 * `tickets.admin.searchEventTickets`. `ticketId` and `registeredEmail` exist
 * for the PROVENANCE trail, which is written server-side from this record, so
 * the client never supplies either.
 */
export interface TicketCandidate {
  /** The provider's ticket id — the provenance trail's anchor. */
  ticketId: number
  /** The name on the ticket, as the provider holds it. May be empty. */
  name: string
  /** Normalized (NFKC + trimmed + lowercased) contact address. Never empty. */
  email: string
  /** The address EXACTLY as registered, before normalization. */
  registeredEmail: string
  category: string
}

/**
 * Provider tickets narrowed to {@link TicketCandidate}.
 *
 * `crm.email` is typed `string` but the provider does hand back tickets with no
 * contact email; `normalizeEmail` null-guards and the empty result is DROPPED —
 * an address-less ticket can neither be matched nor linked, so it is not a
 * candidate for anything.
 */
export function toTicketCandidates(tickets: EventTicket[]): TicketCandidate[] {
  const candidates: TicketCandidate[] = []
  for (const ticket of tickets) {
    const email = normalizeEmail(ticket.crm?.email)
    if (!email) continue
    const name =
      [ticket.crm?.first_name, ticket.crm?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      ticket.customer_name?.trim() ||
      ''
    candidates.push({
      ticketId: ticket.id,
      name,
      email,
      registeredEmail: ticket.crm?.email ?? '',
      category: ticket.category,
    })
  }
  return candidates
}

/**
 * The tickets an organizer's search matches, by name or address, capped.
 *
 * Substring rather than prefix: an organizer typing a surname, or the domain of
 * the work address they suspect, is the case this exists for. The cap is what
 * keeps a one-character query from returning the whole attendee list.
 */
export function searchTicketCandidates(
  candidates: TicketCandidate[],
  query: string,
  limit = 20,
): TicketCandidate[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  const matches: TicketCandidate[] = []
  for (const candidate of candidates) {
    if (
      candidate.email.includes(needle) ||
      candidate.name.toLowerCase().includes(needle)
    ) {
      matches.push(candidate)
      if (matches.length >= limit) break
    }
  }
  return matches
}

/**
 * The normalized addresses that hold a speaker-category ticket.
 *
 * `categories` is the set of names that COUNT — the derived type name plus the
 * historical literal. Passing it in (rather than reading a constant) is what
 * keeps this in step with issuance.
 */
export function redeemedSpeakerEmails(
  candidates: TicketCandidate[],
  categories: Iterable<string> = [SPEAKER_TICKET_CATEGORY],
): Set<string> {
  const wanted = new Set([...categories].map(categoryKey))
  const emails = new Set<string>()
  for (const candidate of candidates) {
    if (!wanted.has(categoryKey(candidate.category))) continue
    emails.add(candidate.email)
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
const ticketsCache = new Map<
  string,
  { expiresAt: number; candidates: Promise<TicketCandidate[] | null> }
>()

/** Test seam: drop the memo so a case cannot inherit another's fetch. */
export function __resetRedeemedCache() {
  ticketsCache.clear()
}

/**
 * The event's tickets, narrowed to {@link TicketCandidate}, or `null` when the
 * provider is unconfigured, uncredentialed or failing. Never throws.
 *
 * ONE MEMO SERVES BOTH READERS. The claim-status join and the organizer's
 * ticket search ask the same question of the same provider, so the search adds
 * no fetch of its own: it filters the list this already holds.
 */
export async function fetchEventTicketCandidates(
  conference: ConferenceTicketingBinding,
): Promise<TicketCandidate[] | null> {
  const orgId = conference.organization?._ref
  // Fail closed: without an owning org there is no account to key the memo on,
  // and `resolveTicketingCredentials` would decline anyway.
  if (!orgId) return null

  try {
    const ticketing = await resolveTicketingProvider(conference)
    if (!ticketing.configured) return null

    const key = `${orgId}:${JSON.stringify(ticketing.eventRef)}`
    const now = Date.now()
    const cached = ticketsCache.get(key)
    if (cached && cached.expiresAt > now) return await cached.candidates

    const candidates = ticketing.provider
      .fetchEventTickets(ticketing.eventRef)
      .then(toTicketCandidates)
    // A failed fetch must not be served for the rest of the window — but evict
    // only if THIS promise is still the entry. A rejection arriving after the
    // TTL lapsed would otherwise delete a newer in-flight fetch installed under
    // the same key, and every concurrent caller would issue its own.
    candidates.catch(() => {
      if (ticketsCache.get(key)?.candidates === candidates) {
        ticketsCache.delete(key)
      }
    })
    ticketsCache.set(key, { expiresAt: now + TICKETS_TTL_MS, candidates })
    // Keep a long-lived warm instance from growing an entry per event forever.
    for (const [k, entry] of ticketsCache) {
      if (entry.expiresAt <= now) ticketsCache.delete(k)
    }
    return await candidates
  } catch (error) {
    console.error('[speakerTicketStatus] provider read failed', error)
    return null
  }
}

/**
 * The redeemed set for a conference, or `null` when the provider could not
 * answer OR the speaker ticket type cannot be identified — no invite-only type
 * matching `/speaker/i` exists, or the type list could not be read.
 *
 * `null` propagates to `unknown`. That is the point: without the type there is
 * no way to tell an unclaimed comp from a claim filed under a name we never
 * learned, and "not claimed" is the one answer that would put an organizer on
 * the phone to people who already have their ticket.
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

    // A PROVIDER THAT CANNOT SEND INVITATIONS CAN NEVER HAVE ISSUED ONE.
    // Issuance aborts on exactly this capability, so no marker can exist and no
    // claim can be attributed — the honest answer is `unknown`. Reporting
    // "not invited" would be defensible but useless, and "not claimed" would
    // send an operator chasing people who were never asked. It also saves the
    // full paginated event fetch (Tito: up to 100 pages) for an answer that
    // could not have existed.
    if (!ticketing.provider.sendTicketInvitation) return null

    // The type lookup is memoized separately and shared with issuance, so this
    // costs no extra round-trip inside a sweep.
    const speakerType = await resolveSpeakerTicketType(ticketing, orgId)
    if (!speakerType) {
      console.warn(
        '[speakerTicketStatus] No invitation-gated ticket type matching /speaker/i; ' +
          'reporting unknown rather than guessing at a category name.',
      )
      return null
    }

    const candidates = await fetchEventTicketCandidates(conference)
    if (!candidates) return null

    // The derived name FIRST, the historical literal as the fallback, so a
    // tenant that renamed its type keeps its earlier claims counted.
    return redeemedSpeakerEmails(candidates, [
      speakerType.name,
      SPEAKER_TICKET_CATEGORY,
    ])
  } catch (error) {
    console.error('[speakerTicketStatus] provider read failed', error)
    return null
  }
}
