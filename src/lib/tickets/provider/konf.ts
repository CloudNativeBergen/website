// Native Konf ticketing (#2238): orders live on the platform, so this provider
// reads them through the Konf API as the signed-in organizer instead of
// calling a vendor. The gateway names the conference from the request host
// and refuses anyone without `ticketing.read`, so there is no client-supplied
// conference id anywhere on this path.
import 'server-only'
import type { EventTicket } from '@/lib/tickets/types'
import { ticketsFromOrders } from './konf-orders'
import type {
  EventDiscount,
  TicketType,
  CreateEventDiscountInput,
} from '@/lib/discounts/types'
import {
  identityJwt,
  mutate,
  requestHost,
} from '@/lib/konf-api/conference-write'
import { graphql, type ResultOf } from '@/lib/konf-api/graphql'
import {
  DEFAULT_TICKET_CURRENCY,
  ProviderUnsupportedError,
  type EventRef,
  type LegacyOrderCreatedData,
  type OrderPaymentDetails,
  type PublicEventInfo,
  type PublicTicketType,
  type TicketAmountBasis,
  type TicketingCapabilities,
  type TicketingProvider,
  type WebhookVerifyResult,
} from './types'

const PROVIDER_NAME = 'Konf'

const ORDERS =
  `query { ticketOrders { id createdAt status buyerName buyerEmail lines { ticketTypeId ticketTypeName quantity unitPrice { amountMinor currency } } } }` as const
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing only
const ORDERS_DOC = graphql(ORDERS)
export { ticketsFromOrders }
const SALES =
  `query { ticketSales { byType { id name capacity sold price { amountMinor currency } } } }` as const
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing only
const SALES_DOC = graphql(SALES)

async function query<T>(doc: string): Promise<T | undefined> {
  const [host, jwt] = await Promise.all([requestHost(), identityJwt()])
  if (!host || !jwt)
    throw new Error('Konf ticketing needs a signed-in organizer')
  return mutate<T>(host, doc, {}, jwt)
}

export class KonfProvider implements TicketingProvider {
  readonly name = PROVIDER_NAME
  readonly capabilities: TicketingCapabilities = {
    discounts: false,
    paymentDetails: false,
    checkin: false,
  }
  /** Rows are minted per seat from the line's unit price. */
  readonly amountBasis: TicketAmountBasis = 'per-ticket'
  /**
   * Unknown, on purpose: the platform stores amounts as the selling provider
   * reported them and records no VAT basis (see `TicketOrder.total` in
   * api/public-schema.graphql), so the revenue card makes no VAT claim.
   */
  readonly amountsIncludeVat = undefined

  /** No vendor credentials: access is the org's ticketing entitlement. */
  isConfigured(): boolean {
    return true
  }

  async fetchEventTickets(): Promise<EventTicket[]> {
    const data = await query<ResultOf<typeof ORDERS_DOC>>(ORDERS)
    return ticketsFromOrders(data?.ticketOrders ?? [])
  }

  async fetchPublicTicketTypes(
    event: EventRef,
  ): Promise<{ event: PublicEventInfo; tickets: PublicTicketType[] }> {
    const data = await query<ResultOf<typeof SALES_DOC>>(SALES)
    const tickets = (data?.ticketSales?.byType ?? []).map(
      (t, position): PublicTicketType => ({
        id: t.id ?? String(position),
        name: t.name ?? 'Ticket',
        type: 'ticket',
        description: null,
        price: [
          {
            price: {
              amountMinor: t.price?.amountMinor ?? 0,
              currency: t.price?.currency ?? DEFAULT_TICKET_CURRENCY,
            },
            vat: '0',
            description: null,
            key: null,
          },
        ],
        available:
          t.capacity == null ? null : Math.max(0, t.capacity - (t.sold ?? 0)),
        requiresInvitation: false,
        visibleStartsAt: null,
        visibleEndsAt: null,
        position,
      }),
    )
    return {
      event: {
        id: 0,
        name: event.externalId,
        registrationOpensAt: null,
        registrationClosesAt: null,
        currencies: [],
      },
      tickets,
    }
  }

  async fetchOrderPaymentDetails(): Promise<OrderPaymentDetails | null> {
    throw new ProviderUnsupportedError(
      PROVIDER_NAME,
      'fetchOrderPaymentDetails',
    )
  }
  async listDiscounts(): Promise<{
    discounts: EventDiscount[]
    ticketTypes: TicketType[]
  }> {
    throw new ProviderUnsupportedError(PROVIDER_NAME, 'listDiscounts')
  }
  async createDiscount(
    input: CreateEventDiscountInput,
  ): Promise<EventDiscount> {
    void input
    throw new ProviderUnsupportedError(PROVIDER_NAME, 'createDiscount')
  }
  async deleteDiscount(): Promise<boolean> {
    throw new ProviderUnsupportedError(PROVIDER_NAME, 'deleteDiscount')
  }
  /** Native orders arrive through the platform, never a site webhook. */
  verifyWebhook(): WebhookVerifyResult {
    return { verified: false, reason: 'not-configured' }
  }
  parseOrderCreated(): LegacyOrderCreatedData | null {
    return null
  }
}
