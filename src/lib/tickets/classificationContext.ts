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
import type { EventDiscount } from '@/lib/discounts/types'
import type { TicketClassificationContext } from './classification'
import type { EventRef, TicketingProvider } from './provider'
import { resolveSpeakerTicketType } from './speakerStatus'

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
): Promise<EventDiscount[] | undefined> {
  if (access.eventRef.provider === 'tito') return undefined
  try {
    const { discounts } = await access.provider.listDiscounts(
      access.eventRef.eventId,
    )
    return discounts
  } catch (err) {
    console.error('Unable to read discount codes for ticket counting:', err)
    return undefined
  }
}

export async function buildClassificationContext(
  access: TicketClassificationAccess,
  conference: Conference,
): Promise<TicketClassificationContext> {
  const discounts = await readDiscounts(access)

  // A failed type lookup only costs us the DERIVED speaker type name;
  // `classifyTicket` still matches the historical literal, so it is not a
  // reason to call the whole classification unavailable.
  const speakerTicketTypeName = await resolveSpeakerTicketType(
    { configured: true, provider: access.provider, eventRef: access.eventRef },
    conference.organization?._ref,
  )
    .then((type) => type?.name)
    .catch(() => undefined)

  return {
    discounts,
    sponsorNames: conference.sponsors?.map((s) => s.sponsor.name) ?? [],
    speakerTicketTypeName,
    ticketTypeRoles: conference.ticketTypeRoles,
  }
}
