import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { getTicketingProvider } from './index'
import { TitoProvider, TITO_API_URL } from './tito'
import { ProviderUnsupportedError, type EventRef } from './types'

const CREDS = {
  apiKey: 'tito-token',
  webhookSecret: 'tito-webhook-secret',
}

const TITO_REF: EventRef = {
  provider: 'tito',
  accountSlug: 'acme',
  eventSlug: '2026',
}

interface JsonResponse {
  ok: boolean
  status: number
  statusText: string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

function ok(body: unknown): JsonResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function err(status: number, body = ''): JsonResponse {
  return {
    ok: false,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'Error',
    json: async () => ({}),
    text: async () => body,
  }
}

/**
 * A fetch stub that routes on the Tito REST path. `releases`/`event`/`tickets`
 * are the per-endpoint response bodies; a numeric `authStatus` forces an error.
 */
function stubTitoFetch(handlers: {
  event?: unknown
  releases?: unknown[]
  ticketPages?: Array<{ tickets: unknown[]; nextPage: number | null }>
  authStatus?: number
}) {
  let ticketCall = 0
  return vi.fn(async (url: string) => {
    if (handlers.authStatus) return err(handlers.authStatus, 'denied')
    if (url.includes('/releases')) {
      return ok({ releases: handlers.releases ?? [] })
    }
    if (url.includes('/tickets')) {
      const page = handlers.ticketPages?.[ticketCall] ?? {
        tickets: [],
        nextPage: null,
      }
      ticketCall++
      return ok({ tickets: page.tickets, meta: { next_page: page.nextPage } })
    }
    // Otherwise the single-event metadata GET (`/:account/:event`).
    return ok({ event: handlers.event ?? {} })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('getTicketingProvider factory — tito', () => {
  it('returns a TitoProvider for the "tito" type', () => {
    const provider = getTicketingProvider('tito', CREDS)
    expect(provider).toBeInstanceOf(TitoProvider)
    expect(provider.name).toBe('Tito')
  })

  it('reports isConfigured from the injected API token, never from env', () => {
    expect(getTicketingProvider('tito', CREDS).isConfigured()).toBe(true)
    expect(getTicketingProvider('tito', {}).isConfigured()).toBe(false)
  })

  it('defaults the base URL to the platform constant but honors an override', async () => {
    const fetchSpy = stubTitoFetch({ event: { id: 1, title: 'X' } })
    vi.stubGlobal('fetch', fetchSpy)

    await getTicketingProvider('tito', {
      ...CREDS,
      apiUrl: 'https://tito.example.test/v3',
    }).fetchPublicTicketTypes(TITO_REF)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://tito.example.test/v3/acme/2026'),
      expect.anything(),
    )

    fetchSpy.mockClear()
    await getTicketingProvider('tito', CREDS).fetchPublicTicketTypes(TITO_REF)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${TITO_API_URL}/acme/2026`),
      expect.anything(),
    )
  })
})

describe('TitoProvider — fetchPublicTicketTypes', () => {
  it('maps event + releases (title/price/quantity/position)', async () => {
    const fetchSpy = stubTitoFetch({
      event: { id: 99, title: 'Acme 2026', currency: 'EUR' },
      releases: [
        {
          id: 1,
          slug: 'early-bird',
          title: 'Early Bird',
          description: 'Cheap seats',
          price: '100.0',
          quantity: 50,
          tickets_count: 12,
          position: 0,
          start_at: '2026-01-01T00:00:00Z',
          end_at: '2026-02-01T00:00:00Z',
        },
      ],
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getTicketingProvider(
      'tito',
      CREDS,
    ).fetchPublicTicketTypes(TITO_REF)

    expect(result.event).toEqual({
      id: 99,
      name: 'Acme 2026',
      registrationOpensAt: null,
      registrationClosesAt: null,
      currencies: ['EUR'],
    })
    expect(result.tickets).toHaveLength(1)
    const t = result.tickets[0]
    expect(t.name).toBe('Early Bird')
    // Remaining = cap (50) - issued (12); the raw cap alone would mislead the
    // UI's low-stock messaging.
    expect(t.available).toBe(38)
    expect(t.requiresInvitation).toBe(false)
    expect(t.visibleStartsAt).toBe('2026-01-01T00:00:00Z')
    // VAT-inclusive bridge: gross price surfaced with vat '0' so incl/excl math
    // is a no-op downstream.
    expect(t.price).toEqual([
      { price: '100.0', vat: '0', description: null, key: null },
    ])
  })

  it('maps a FREE release (price 0, unlimited quantity)', async () => {
    const fetchSpy = stubTitoFetch({
      event: { id: 1, title: 'X' },
      releases: [{ id: 7, title: 'Community', price: '0.0', quantity: null }],
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { tickets } = await getTicketingProvider(
      'tito',
      CREDS,
    ).fetchPublicTicketTypes(TITO_REF)
    expect(tickets[0].price[0].price).toBe('0.0')
    // null quantity ⇒ unlimited ⇒ available null.
    expect(tickets[0].available).toBeNull()
  })

  it('maps a HIDDEN/secret release to requiresInvitation', async () => {
    const fetchSpy = stubTitoFetch({
      event: { id: 1, title: 'X' },
      releases: [{ id: 3, title: 'Speaker', price: '0.0', secret: true }],
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { tickets } = await getTicketingProvider(
      'tito',
      CREDS,
    ).fetchPublicTicketTypes(TITO_REF)
    expect(tickets[0].requiresInvitation).toBe(true)
  })

  it('throws an access-denied error on a 401 (auth failure)', async () => {
    vi.stubGlobal('fetch', stubTitoFetch({ authStatus: 401 }))
    await expect(
      getTicketingProvider('tito', CREDS).fetchPublicTicketTypes(TITO_REF),
    ).rejects.toThrow(/access denied/i)
  })

  it('unsupported-errors on a bare numeric event id (Checkin-shaped)', async () => {
    await expect(
      getTicketingProvider('tito', CREDS).fetchPublicTicketTypes(7),
    ).rejects.toBeInstanceOf(ProviderUnsupportedError)
  })
})

describe('TitoProvider — fetchEventTickets', () => {
  it('maps email/name/release/state and follows pagination', async () => {
    const fetchSpy = stubTitoFetch({
      ticketPages: [
        {
          tickets: [
            {
              id: 1,
              registration_id: 500,
              first_name: 'Ada',
              last_name: 'Lovelace',
              email: 'ada@example.com',
              release_title: 'Speaker ticket',
              state: 'complete',
              price: '0.0',
              created_at: '2026-03-01',
            },
          ],
          nextPage: 2,
        },
        {
          tickets: [
            {
              id: 2,
              email: 'grace@example.com',
              release_title: 'Conference',
              state: 'incomplete',
            },
          ],
          nextPage: null,
        },
      ],
    })
    vi.stubGlobal('fetch', fetchSpy)

    const tickets = await getTicketingProvider('tito', CREDS).fetchEventTickets(
      TITO_REF,
    )

    expect(tickets).toHaveLength(2)
    expect(tickets[0].crm.email).toBe('ada@example.com')
    expect(tickets[0].category).toBe('Speaker ticket')
    expect(tickets[0].order_id).toBe(500)
    expect(tickets[0].order?.paid).toBe(true)
    // A paid registration owes nothing; an incomplete one still owes its price.
    expect(tickets[0].sum_left).toBe('0')
    expect(tickets[1].order?.paid).toBe(false)
    expect(tickets[1].sum_left).toBe(tickets[1].sum)
    // A missing registration_id gets a per-ticket negative fallback, never a
    // shared sentinel that would merge unrelated tickets into one order.
    expect(tickets[1].order_id).toBe(-2)
    // Page 1 then page 2 were both fetched.
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('throws instead of returning partial data when pagination never ends', async () => {
    // Every page reports another next_page — a looping/pathological cursor.
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            tickets: [{ id: 1, email: 'a@example.com' }],
            meta: { next_page: 2 },
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchSpy)
    await expect(
      getTicketingProvider('tito', CREDS).fetchEventTickets(TITO_REF),
    ).rejects.toThrow(/refusing to return partial data/)
  })

  it('throws a wiring error when handed a Checkin-shaped ref', async () => {
    await expect(
      getTicketingProvider('tito', CREDS).fetchEventTickets({
        customerId: 1,
        eventId: 2,
      }),
    ).rejects.toThrow(/non-Tito event reference/i)
  })
})

describe('TitoProvider — unsupported members (typed, not generic)', () => {
  const provider = getTicketingProvider('tito', CREDS)

  it('fetchOrderPaymentDetails is ProviderUnsupportedError', async () => {
    await expect(provider.fetchOrderPaymentDetails(1)).rejects.toBeInstanceOf(
      ProviderUnsupportedError,
    )
  })
  it('listDiscounts is ProviderUnsupportedError', async () => {
    await expect(provider.listDiscounts(1)).rejects.toBeInstanceOf(
      ProviderUnsupportedError,
    )
  })
  it('createDiscount is ProviderUnsupportedError', async () => {
    await expect(
      provider.createDiscount({
        eventId: 1,
        discountCode: 'X',
        numberOfTickets: 1,
        ticketTypes: [],
      }),
    ).rejects.toBeInstanceOf(ProviderUnsupportedError)
  })
  it('deleteDiscount is ProviderUnsupportedError', async () => {
    await expect(provider.deleteDiscount(1, 'X')).rejects.toBeInstanceOf(
      ProviderUnsupportedError,
    )
  })
})

describe('TitoProvider — verifyWebhook', () => {
  const rawBody = JSON.stringify({ hello: 'world' })
  const sign = (secret: string) =>
    createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')

  it('accepts a valid base64 HMAC-SHA256 over the raw body', () => {
    const provider = getTicketingProvider('tito', CREDS)
    const headers = new Headers({
      'tito-signature': sign(CREDS.webhookSecret),
    })
    expect(provider.verifyWebhook(rawBody, headers)).toEqual({ verified: true })
  })

  it('rejects an invalid signature', () => {
    const provider = getTicketingProvider('tito', CREDS)
    const headers = new Headers({ 'tito-signature': sign('wrong') })
    expect(provider.verifyWebhook(rawBody, headers)).toEqual({
      verified: false,
      reason: 'invalid-signature',
    })
  })

  it('rejects a missing signature header', () => {
    const provider = getTicketingProvider('tito', CREDS)
    expect(provider.verifyWebhook(rawBody, new Headers())).toEqual({
      verified: false,
      reason: 'invalid-signature',
    })
  })

  it('reports not-configured when no webhook secret was injected', () => {
    const provider = getTicketingProvider('tito', { apiKey: 'k' })
    const headers = new Headers({ 'tito-signature': 'anything' })
    expect(provider.verifyWebhook(rawBody, headers)).toEqual({
      verified: false,
      reason: 'not-configured',
    })
  })

  it('parseOrderCreated returns null (Checkin-shaped payload has no Tito analogue)', () => {
    const provider = getTicketingProvider('tito', CREDS)
    expect(
      provider.parseOrderCreated({
        payloadId: 'p',
        event: 'event-order-created',
        dataType: 'order',
        data: {
          id: 1,
          eventId: 1,
          users: [],
          orderContact: {
            crm: {
              id: 1,
              firstName: 'A',
              lastName: 'B',
              email: { email: 'a@b' },
            },
          },
        },
      }),
    ).toBeNull()
  })
})
