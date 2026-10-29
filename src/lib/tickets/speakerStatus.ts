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
import { runAfterResponse } from '@/server/runAfterResponse'
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
  additionals?: { name: string; value: string }[]
  fields?: { key: string; value: string }[]
  manageUrl?: string
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
  orderId: number
  /** The name on the ticket, as the provider holds it. May be empty. */
  name: string
  /** Normalized (NFKC + trimmed + lowercased) contact address. Never empty. */
  email: string
  /** The address EXACTLY as registered, before normalization. */
  registeredEmail: string
  category: string
  additionals?: { name: string; value: string }[]
  fields?: { key: string; value: string }[]
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
      orderId: ticket.order_id,
      name,
      email,
      registeredEmail: ticket.crm?.email ?? '',
      category: ticket.category,
      additionals: ticket.additionals,
      fields: ticket.fields,
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
): Map<string, TicketCandidate> {
  const wanted = new Set([...categories].map(categoryKey))
  const emails = new Map<string, TicketCandidate>()
  for (const candidate of candidates) {
    if (!wanted.has(categoryKey(candidate.category))) continue
    emails.set(candidate.email, candidate)
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
  redeemed: Map<string, TicketCandidate> | null,
  conference?: ConferenceTicketingBinding,
): SpeakerTicketStatus[] {
  return speakers.map((speaker) => {
    const invitedAt = speaker.invitedAt ?? undefined
    if (!redeemed) {
      return { speakerId: speaker.speakerId, state: 'unknown', invitedAt }
    }
    let foundTicket: TicketCandidate | undefined
    const hasTicket = speaker.emails.some((email) => {
      const normalized = normalizeEmail(email)
      if (normalized !== '' && redeemed.has(normalized)) {
        foundTicket = redeemed.get(normalized)
        return true
      }
      return false
    })
    return {
      speakerId: speaker.speakerId,
      state: hasTicket ? 'redeemed' : invitedAt ? 'invited' : 'not-invited',
      invitedAt,
      additionals: foundTicket?.additionals,
      fields: foundTicket?.fields,
      manageUrl:
        foundTicket &&
        conference?.checkinCustomerId &&
        conference?.checkinEventId
          ? `https://app.checkin.no/customer/${conference?.checkinCustomerId}/event/${conference?.checkinEventId}/orders/order?id=${foundTicket.orderId}`
          : undefined,
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

/**
 * How long a reader that opted into {@link TicketCandidateReadOptions.allowStale}
 * may be served the last list that ARRIVED while a refresh is in flight or
 * failing, counted from when the read that produced it started. Past this the
 * reader waits on the refresh in flight, and fails closed if the provider
 * cannot answer — at once, without asking it again, inside the pause that
 * follows a failure ({@link TICKETS_RETRY_AFTER_FAILURE_MS}).
 */
const TICKETS_MAX_STALE_MS = 10 * 60_000

/**
 * How long a refresh that has outlived its window stays THE refresh for its
 * key. A paginated whole-event read can take longer than the window; starting a
 * second one each time it lapses would run them in parallel and lose the first
 * one's result. Past this, the refresh is presumed stuck and a caller may start
 * another.
 */
const TICKETS_REFRESH_PATIENCE_MS = 2 * 60_000

/**
 * How long a FAILED read holds the key against readers that opted into
 * {@link TicketCandidateReadOptions.allowStale}. Without it every attendee
 * action during an outage issues its own request, one after the other, at
 * whatever rate attendees click. During the pause such a reader keeps the last
 * list, or is told the provider could not answer (`null`) if none ever
 * arrived, it is past the cap, or it will not do for that reader.
 *
 * A reader that did NOT opt in is not held: it retries the provider at once, as
 * it always has. Those are a handful of organizers, not a registration opening.
 */
const TICKETS_RETRY_AFTER_FAILURE_MS = 5_000

interface TicketsEntry {
  startedAt: number
  expiresAt: number
  candidates: Promise<TicketCandidate[]>
  /** `candidates`, settled either way. Never rejects. */
  settled: Promise<void>
  /** True until `candidates` settles. */
  pending: boolean
  /** True once `candidates` has rejected. */
  failed: boolean
  /**
   * The newest list that actually arrived under this key, and when the read
   * that produced it STARTED — which is how recent the data is, however long
   * the read took.
   */
  arrived?: { startedAt: number; value: TicketCandidate[] }
}

const ticketsCache = new Map<string, TicketsEntry>()

/** Options for {@link fetchEventTicketCandidates}. */
export interface TicketCandidateReadOptions {
  /**
   * Take the last list that arrived instead of waiting, while a refresh is in
   * flight or after it failed — for at most {@link TICKETS_MAX_STALE_MS}.
   *
   * FOR READERS ON AN ATTENDEE'S CRITICAL PATH. The workshop gate runs on every
   * signup click, and seats are first-come: without this, every caller blocks
   * on one slow whole-event fetch each time the window lapses, and a provider
   * outage refuses every ticket holder at once. The price is that a change at
   * the provider is seen one refresh later, and during an outage a refunded
   * ticket keeps answering for up to the cap.
   *
   * A FUNCTION decides per list: it is handed the last arrived list and takes
   * it only when it returns true; otherwise the reader waits for the refresh
   * in flight like a reader that did not opt in (but never starts a retry
   * inside the pause after a failure). The gate uses this so that a stale list
   * can ADMIT a ticket holder and can never REFUSE one who bought since.
   *
   * Off by default: the organizer surfaces want the answer the provider gives
   * now, and can afford to wait for it.
   */
  allowStale?: boolean | ((arrived: TicketCandidate[]) => boolean)
  /**
   * Answer from a provider read that STARTS NOW, never from the memo or from a
   * refresh already in flight. The read becomes the memo, so the next reader
   * pays nothing for it.
   *
   * FOR A ONE-SHOT THAT MUST NOT MISS A TICKET SOLD SECONDS AGO — the workshop
   * instructions resend, which mails every holder once and then locks for an
   * hour. Not for anything on a request path: it is a whole-event fetch.
   */
  fresh?: boolean
}

/** Test seam: drop the memo so a case cannot inherit another's fetch. */
export function __resetRedeemedCache() {
  ticketsCache.clear()
}

/**
 * The event's tickets, narrowed to {@link TicketCandidate}, or `null` when the
 * provider is unconfigured, uncredentialed or failing. Never throws.
 *
 * ONE MEMO SERVES EVERY READER. The claim-status join, the organizer's ticket
 * search and the workshop gate ask the same question of the same provider, so
 * none adds a fetch of its own: each filters the list this already holds.
 */
export async function fetchEventTicketCandidates(
  conference: ConferenceTicketingBinding,
  options?: TicketCandidateReadOptions,
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
    const withinStaleCap = (entry: TicketsEntry) =>
      entry.arrived !== undefined &&
      now - entry.arrived.startedAt <= TICKETS_MAX_STALE_MS

    // A refresh still in flight past its window is shared, not restarted.
    const stillRefreshing = (entry: TicketsEntry) =>
      entry.pending && now - entry.startedAt < TICKETS_REFRESH_PATIENCE_MS

    let entry = ticketsCache.get(key)
    if (
      !entry ||
      options?.fresh ||
      (entry.expiresAt <= now && !stillRefreshing(entry)) ||
      (entry.failed && !options?.allowStale)
    ) {
      const candidates = ticketing.provider
        .fetchEventTickets(ticketing.eventRef)
        .then(toTicketCandidates)
      const refresh: TicketsEntry = {
        startedAt: now,
        expiresAt: now + TICKETS_TTL_MS,
        candidates,
        settled: Promise.resolve(),
        pending: true,
        failed: false,
        // Carried over so a stale reader has something to take meanwhile.
        arrived: entry?.arrived,
      }
      refresh.settled = candidates.then(
        (value) => {
          refresh.pending = false
          refresh.arrived = { startedAt: now, value }
          // This refresh was given up on and replaced, but it did answer: a
          // list that arrived must not be lost to whichever entry holds the
          // key now — UNLESS that entry already holds a list from a read that
          // started later. A late answer is an older snapshot, and must not
          // replace a newer one (a ticket bought in between would vanish).
          const current = ticketsCache.get(key)
          if (
            current &&
            current !== refresh &&
            (!current.arrived || current.arrived.startedAt < now)
          ) {
            current.arrived = refresh.arrived
          }
        },
        (error) => {
          refresh.pending = false
          refresh.failed = true
          // Act only if THIS refresh is still the entry: a rejection arriving
          // after it was replaced must not touch the newer fetch installed
          // under the same key.
          if (ticketsCache.get(key) !== refresh) return
          // A failure is not held for the rest of the window. It holds the key
          // for a short pause, against stale readers only, so they retry an
          // outage at a bounded rate — whether or not there is an arrived list
          // for them to keep meanwhile.
          refresh.expiresAt = Date.now() + TICKETS_RETRY_AFTER_FAILURE_MS
          if (refresh.arrived) {
            console.error(
              '[speakerTicketStatus] refresh failed; stale readers keep the last list',
              error,
            )
          }
        },
      )
      ticketsCache.set(key, refresh)
      // Keep a long-lived warm instance from growing an entry per event
      // forever — but not at the cost of a list a stale reader may still take,
      // nor of a read still in flight, whose answer would have nowhere to land.
      for (const [k, other] of ticketsCache) {
        if (
          other.expiresAt <= now &&
          !other.pending &&
          !withinStaleCap(other)
        ) {
          ticketsCache.delete(k)
        }
      }
      entry = refresh
    }

    const stale = options?.allowStale
    if (stale && (entry.pending || entry.failed) && withinStaleCap(entry)) {
      const arrived = entry.arrived!.value
      if (stale === true || stale(arrived)) {
        if (entry.pending) {
          // Nobody is waiting on this refresh any more, and a serverless
          // instance may be frozen the moment the response flushes — the list
          // would then never arrive, and stale readers would be served the old
          // one until the cap. Keep the instance alive until it settles.
          const { settled } = entry
          runAfterResponse(() => settled)
        }
        return arrived
      }
    }
    return await entry.candidates
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
): Promise<Map<string, TicketCandidate> | null> {
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
