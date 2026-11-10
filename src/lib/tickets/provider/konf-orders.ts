// Pure mapping of native Konf orders to ticket rows: no server-only imports,
// so Storybook can render real native rows.
import type { EventTicket } from '@/lib/tickets/types'
import { DEFAULT_TICKET_CURRENCY } from './types'

/** A `TicketOrder` as `KonfProvider` selects it (api/public-schema.graphql). */
export interface KonfTicketOrder {
  id?: string | null
  createdAt?: string | null
  status?: 'paid' | 'pending' | 'cancelled' | null
  buyerName?: string | null
  buyerEmail?: string | null
  lines?: Array<{
    ticketTypeId?: string | null
    ticketTypeName?: string | null
    quantity?: number | null
    unitPrice?: { amountMinor?: number | null; currency?: string | null } | null
  }> | null
}

/**
 * One ticket row per seat (line quantity), so every page built on
 * `fetchEventTickets` (stats, progression, orders, attendees) works unchanged.
 * Cancelled orders are not sold tickets and are dropped. The platform does not
 * record attendees per seat, so each row carries the buyer; `buyerName` is null
 * without `attendee.read_pii` or when the provider sent none.
 */
export function ticketsFromOrders(orders: KonfTicketOrder[]): EventTicket[] {
  const rows: EventTicket[] = []
  for (const o of orders) {
    if (o.status === 'cancelled' || !o.id) continue
    const paid = o.status === 'paid'
    const name = o.buyerName?.trim() || null
    const [first = '', ...rest] = name?.split(/\s+/) ?? []
    for (const [li, line] of (o.lines ?? []).entries()) {
      const amountMinor = line.unitPrice?.amountMinor ?? 0
      const currency = line.unitPrice?.currency ?? DEFAULT_TICKET_CURRENCY
      for (let i = 0; i < (line.quantity ?? 0); i++) {
        rows.push({
          id: `${o.id}:${li}:${i}`,
          order_id: o.id,
          order_date: o.createdAt ?? '',
          category: line.ticketTypeName ?? 'Ticket',
          customer_name: name,
          sum: { amountMinor, currency },
          sum_left: { amountMinor: paid ? 0 : amountMinor, currency },
          fields: [],
          crm: {
            first_name: first,
            last_name: rest.join(' '),
            email: o.buyerEmail ?? '',
          },
          order: {
            createdAt: o.createdAt ?? '',
            paymentStatus: o.status ?? 'pending',
            paid,
          },
        })
      }
    }
  }
  return rows
}
