/**
 * Assemble the inputs `classifyTicket` needs, from two sources that fail apart.
 *
 * `ticketTypeRoles` and the speaker ticket type come from the CONFERENCE; the
 * discount list comes from the PROVIDER. `/admin/tickets` used to build this
 * inline and answer `null` for a Tito tenant or a failed `listDiscounts` — which
 * dropped `ticketTypeRoles` along with the codes, so every configured
 * workshop-upgrade add-on admitted again and counted as a participant. That is
 * the defect `./classification` exists to remove, reintroduced by an unrelated
 * failure.
 *
 * So there is always a context. A provider failure costs exactly the
 * discount-derived facts (`comp`) and nothing else.
 *
 * It lives here rather than in the page so it can be tested without rendering a
 * Server Component: the null-context regression was invisible to every unit
 * test while it was a local function.
 */
import type { Conference } from '@/lib/conference/types'
import type { EventDiscount, TicketType } from '@/lib/discounts/types'
import type { TicketClassificationContext } from './classification'
import { proposeTicketTypeRoles } from './discovery'
import type { EventRef, TicketingProvider } from './provider'
import { resolveSpeakerTicketType } from './speakerStatus'
import type { EventTicket } from './types'

/** The resolved ticketing access a page already holds. */
export interface TicketClassificationAccess {
  provider: TicketingProvider
  eventRef: EventRef
}

/**
 * The event's discount codes, or `undefined` when they cannot be read.
 *
 * `undefined` is the honest answer, not an empty list: without the codes a
 * redeemed ticket's worth is unknown, and nothing may fall back to the old price
 * split. Only Checkin exposes discounts — `listDiscounts` is keyed on a numeric
 * Checkin event id and Tito unsupported-errors on it, exactly as
 * `/admin/tickets/discount` already treats it.
 */
async function readDiscounts(
  access: TicketClassificationAccess,
): Promise<
  { discounts: EventDiscount[]; ticketTypes: TicketType[] } | undefined
> {
  if (access.eventRef.provider === 'tito') return undefined
  try {
    // The TYPE LIST comes back on the same call and used to be thrown away.
    // `EventDiscount.tickets` holds ticket-type IDs, so without it a 100%-off
    // code cannot be joined to the type it comps — see `./discovery`.
    return await access.provider.listDiscounts(access.eventRef.eventId)
  } catch (err) {
    console.error('Unable to read discount codes for ticket counting:', err)
    return undefined
  }
}

/**
 * @param tickets the event's tickets, for the co-holding signal in
 *                `./discovery`. Omitted (as the non-ticket callers do) simply
 *                costs the proposals: everything else is unchanged, and no
 *                proposal ever moves a count.
 */
export async function buildClassificationContext(
  access: TicketClassificationAccess,
  conference: Conference,
  tickets: readonly EventTicket[] = [],
): Promise<TicketClassificationContext> {
  const discountData = await readDiscounts(access)
  const discounts = discountData?.discounts

  // A failed type lookup only costs us the DERIVED speaker type name;
  // `classifyTicket` still matches the historical literal, so it is not a
  // reason to call the whole classification unavailable.
  const speakerType = await resolveSpeakerTicketType(
    { configured: true, provider: access.provider, eventRef: access.eventRef },
    conference.organization?._ref,
  ).catch(() => undefined)

  // The types discovery gets to reason about: the list that came free with the
  // discounts (IDs, so a code can be joined to a type) plus the one type we
  // know is invitation-gated, which is the only `requiresInvitation` flag
  // either read hands us.
  const ticketTypes = (discountData?.ticketTypes ?? []).map((type) => ({
    id: type.id,
    name: type.name,
    requiresInvitation: type.name === speakerType?.name,
  }))
  if (speakerType && !ticketTypes.some((t) => t.name === speakerType.name)) {
    ticketTypes.push({
      id: speakerType.id,
      name: speakerType.name,
      requiresInvitation: true,
    })
  }

  return {
    discounts,
    sponsorNames: conference.sponsors?.map((s) => s.sponsor.name) ?? [],
    speakerTicketTypeName: speakerType?.name,
    ticketTypeRoles: conference.ticketTypeRoles,
    ticketTypeProposals: proposeTicketTypeRoles({
      tickets,
      discounts,
      ticketTypes,
      ticketTypeRoles: conference.ticketTypeRoles,
    }),
  }
}
