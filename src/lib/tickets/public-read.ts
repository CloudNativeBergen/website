import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { parseTicketAmount } from './amount'
import {
  resolveTicketingProvider,
  type ConferenceTicketingBinding,
} from './provider'
import type { PublicTicketType } from './provider/types'
import {
  extractComplimentaryTickets,
  isPublicFreeTicketType,
  type PublicTicketTypesResult,
} from './public'

/**
 * The cached public ticket read, kept apart from the pure helpers in
 * `./public` so display code never loads the provider barrel (#964).
 */
export async function getPublicTicketTypes(
  conference: ConferenceTicketingBinding,
  conferenceId: string,
): Promise<PublicTicketTypesResult> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:tickets')
  // Ticket mutations revalidate conferenceTag, not 'content:tickets'; without
  // this tag a nested cache hit would keep serving old prices.
  cacheTag(conferenceTag(conferenceId))

  try {
    // Route through the request-boundary resolver (B7) so a tenant's per-org
    // Checkin key is honored end-to-end instead of the platform env creds.
    // The resolver requires the FULL binding (customer + event id) — an event
    // id alone is a configuration error, not a supported state — and an
    // unconfigured conference soft-fails to null. Callers gate on
    // `hasTicketingBinding` (and pass `ticketingBinding(conference)`, keeping
    // this function's 'use cache' key minimal) so the fetch is skipped rather
    // than resolved-and-refused.
    const ticketing = await resolveTicketingProvider(conference)
    if (!ticketing.configured) return { status: 'not-configured' }
    // Pass the provider-shaped eventRef (not a bare event id) so a Tito-bound
    // conference routes to its account/event slugs; Checkin ignores the extra
    // customerId and uses the event id.
    const data = await ticketing.provider.fetchPublicTicketTypes(
      ticketing.eventRef,
    )

    // Public = not invite-only. The list is then SPLIT by price rather than
    // filtered down to the priced ones: a free-to-attend event's entire ticket
    // list is priced at zero, and dropping it made the event indistinguishable
    // from one that has published no tickets at all (#846).
    const publicTickets = data.tickets
      .filter((t) => !t.requiresInvitation)
      .sort((a, b) => a.position - b.position)
    const isPriced = (t: PublicTicketType) =>
      t.price.some((p) => parseTicketAmount(p.price) > 0)

    // Extract complimentary tickets (invite-only or free) that have descriptions
    const complimentaryTickets = extractComplimentaryTickets(data.tickets)

    return {
      status: 'ok',
      event: data.event,
      tickets: publicTickets.filter(isPriced),
      // Routed through the shared predicate (equivalent to `!isPriced` here,
      // since publicTickets already excludes invite-only types) so the bucket
      // and the admin-facing helper below cannot drift apart.
      freeTickets: publicTickets.filter(isPublicFreeTicketType),
      complimentaryTickets,
    }
  } catch (error) {
    console.error('Failed to fetch public ticket types:', error)
    return { status: 'unavailable', error: error as Error }
  }
}
