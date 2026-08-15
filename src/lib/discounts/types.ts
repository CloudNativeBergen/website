export interface EventDiscount {
  id?: string
  trigger: string
  type: string
  value: string
  triggerValue: string | null
  affects: string
  includeBooking: boolean
  affectsValue: string | null
  modes: string[]
  tickets: string[]
  ticketsOnly: boolean
  times: number
  timesTotal: number

  startsAt?: string
  stopsAt?: string
}

export interface TicketType {
  id: string | number
  name: string
  description: string | null
}

/**
 * Whether we managed to READ this event's redemptions — the seam that makes
 * "we do not know" REPRESENTABLE, in the vocabulary
 * `src/lib/conference/guard.ts` already uses for Host resolution (#848, #855).
 *
 *  - `resolved`    — the ticket list was read and usage was derived from it.
 *                    A count of ZERO is a resolved answer, not a missing one:
 *                    it says nobody has redeemed the code yet.
 *  - `unavailable` — the ticket read FAILED. Nothing may be asserted about any
 *                    code's usage; a zero here would be the server claiming a
 *                    fact it never obtained.
 *
 * `not-found` from that union has no analogue here on purpose. Its job there is
 * "the read succeeded and nothing claims this Host" — but an event whose ticket
 * list comes back empty IS a statement about the world (nobody has redeemed
 * anything), so it belongs in `resolved` with every count at zero. Adding a
 * third member that can never be produced would be a shape nobody can test.
 */
export type DiscountUsageStatus = 'resolved' | 'unavailable'

/**
 * What we found for ONE discount code by scanning this event's tickets.
 *
 * Only ever built from a `resolved` read. Its ABSENCE (see `actualUsage`
 * below) is how "unavailable" is expressed — there is deliberately no
 * `usageCount: null` variant to be mistaken for a zero.
 */
export interface DiscountUsage {
  usageCount: number
  ticketIds: number[]
  /**
   * Sum of `ticket.sum` across the tickets that used this code — the amount
   * BUYERS PAID on those tickets, NOT the amount the code discounted.
   *
   * The name matters because the two differ by exactly the discount: a 100%
   * sponsor code produces `totalPaid: 0` while having discounted the full list
   * price. The discounted amount is not derivable from an `EventTicket` —
   * that needs the ticket type's list price joined to the discount's own
   * type/value, neither of which is on the ticket. Until something needs that
   * number badly enough to fetch both, this field states what it holds.
   */
  totalPaid: number
}

export interface DiscountUsageStats {
  [discountCode: string]: DiscountUsage
}

export interface EventDiscountWithUsage extends EventDiscount {
  /**
   * PRESENT whenever usage is `resolved` — including the all-zero case, which
   * is a real answer. ABSENT means the ticket read failed and this code's usage
   * is UNKNOWN; render that as unknown, and never substitute a zero. The
   * provider's own `times` counter is the honest fallback (see
   * `resolveRedemptionCount` in `./usage`).
   */
  actualUsage?: DiscountUsage
}

export interface CreateEventDiscountInput {
  eventId: number
  discountCode: string
  numberOfTickets: number
  ticketTypes: string[]
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  startsAt?: string
  stopsAt?: string
}

export interface EventDiscountsResponse {
  findEventById: {
    id: number
    tickets: TicketType[]
    settings: {
      discounts: EventDiscount[]
    }
  }
}

export interface CreateEventDiscountResponse {
  createEventDiscount: {
    success: boolean
  }
}

export interface DeleteEventDiscountResponse {
  deleteEventDiscount: {
    success: boolean
  }
}
