import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  getTicketingProvider,
  platformCheckinCredentials,
  resolveTicketingProvider,
} from './index'
import { CheckinProvider, CHECKIN_API_URL } from './checkin'
import type { CheckinWebhookPayload } from './types'

const CREDS = {
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  webhookSecret: 'test-webhook-secret',
}

/**
 * A fetch stub that answers the Checkin GraphQL endpoint based on the query
 * name embedded in the request body. Every response is a well-formed GraphQL
 * envelope so the provider's `execute` path is exercised end to end.
 */
function stubCheckinFetch(
  handlers: Partial<{
    eventTickets: unknown[]
    allEventOrderUsers: { data: unknown[]; hasNextPage: boolean }
    findEventById: unknown
    discounts: unknown
  }>,
) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { query: string }
    const q = body.query

    let data: unknown
    if (q.includes('FetchEventTickets')) {
      data = { eventTickets: handlers.eventTickets ?? [] }
    } else if (q.includes('allEventOrderUsers')) {
      const page = handlers.allEventOrderUsers ?? {
        data: [],
        hasNextPage: false,
      }
      data = {
        allEventOrderUsers: {
          records: page.data.length,
          offset: 0,
          length: page.data.length,
          data: page.data,
          pageInfo: { hasNextPage: page.hasNextPage },
        },
      }
    } else if (q.includes('findEventByIdQuery')) {
      data = { findEventById: handlers.discounts }
    } else if (q.includes('FindEvent')) {
      data = { findEventById: handlers.findEventById }
    } else {
      data = {}
    }

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data }),
      text: async () => '',
    }
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('getTicketingProvider factory', () => {
  it('returns a CheckinProvider for the "checkin" type', () => {
    const provider = getTicketingProvider('checkin', CREDS)
    expect(provider).toBeInstanceOf(CheckinProvider)
    expect(provider.name).toBe('Checkin.no')
  })

  it('defaults to Checkin for an unknown/absent provider type', () => {
    // @ts-expect-error — exercising the runtime default for an unknown type
    expect(getTicketingProvider('mystery', CREDS)).toBeInstanceOf(
      CheckinProvider,
    )
    expect(getTicketingProvider(null, CREDS)).toBeInstanceOf(CheckinProvider)
    expect(getTicketingProvider(undefined, CREDS)).toBeInstanceOf(
      CheckinProvider,
    )
  })

  it('reports isConfigured from injected credentials, never from env', () => {
    expect(getTicketingProvider('checkin', CREDS).isConfigured()).toBe(true)
    expect(
      getTicketingProvider('checkin', { apiKey: 'k' }).isConfigured(),
    ).toBe(false)
    expect(getTicketingProvider('checkin', {}).isConfigured()).toBe(false)
  })

  it('defaults apiUrl to the platform constant but honors an override', async () => {
    const fetchSpy = stubCheckinFetch({ eventTickets: [] })
    vi.stubGlobal('fetch', fetchSpy)

    await getTicketingProvider('checkin', {
      ...CREDS,
      apiUrl: 'https://example.test/graphql',
    }).fetchOrderPaymentDetails(1)

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.test/graphql',
      expect.anything(),
    )

    fetchSpy.mockClear()
    await getTicketingProvider('checkin', CREDS).fetchOrderPaymentDetails(1)
    expect(fetchSpy).toHaveBeenCalledWith(CHECKIN_API_URL, expect.anything())
  })
})

describe('platformCheckinCredentials', () => {
  it('assembles credentials from the environment (the request boundary)', () => {
    vi.stubEnv('CHECKIN_API_KEY', 'env-key')
    vi.stubEnv('CHECKIN_API_SECRET', 'env-secret')
    vi.stubEnv('CHECKIN_WEBHOOK_SECRET', 'env-webhook')

    expect(platformCheckinCredentials()).toEqual({
      apiKey: 'env-key',
      apiSecret: 'env-secret',
      webhookSecret: 'env-webhook',
    })
  })
})

describe('resolveTicketingProvider', () => {
  it('resolves a provider + eventRef when the conference is bound', async () => {
    const resolved = await resolveTicketingProvider({
      checkinCustomerId: 42,
      checkinEventId: 7,
    })
    expect(resolved.configured).toBe(true)
    if (resolved.configured) {
      expect(resolved.eventRef).toEqual({ customerId: 42, eventId: 7 })
      expect(resolved.provider).toBeInstanceOf(CheckinProvider)
    }
  })

  it('uses the platform env credentials when no per-org secret is present', async () => {
    vi.stubEnv('CHECKIN_API_KEY', 'env-key')
    vi.stubEnv('CHECKIN_API_SECRET', 'env-secret')
    const resolved = await resolveTicketingProvider({
      checkinCustomerId: 42,
      checkinEventId: 7,
    })
    expect(resolved.configured).toBe(true)
    if (resolved.configured) {
      // Env creds flow through, so the provider reports itself configured.
      expect(resolved.provider.isConfigured()).toBe(true)
    }
  })

  it('prefers a per-org secret over the env default', async () => {
    vi.stubEnv('CHECKIN_API_KEY', 'env-key')
    vi.stubEnv('CHECKIN_API_SECRET', 'env-secret')
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        'org-xyz': {
          ticketing: {
            apiKey: 'org-key',
            apiSecret: 'org-secret',
            apiUrl: 'https://org.example.test/graphql',
          },
        },
      }),
    )
    const fetchSpy = stubCheckinFetch({ eventTickets: [] })
    vi.stubGlobal('fetch', fetchSpy)

    const resolved = await resolveTicketingProvider({
      checkinCustomerId: 42,
      checkinEventId: 7,
      organization: { _ref: 'org-xyz' },
    })
    expect(resolved.configured).toBe(true)
    if (resolved.configured) {
      // The per-org apiUrl override proves the org secret won over the env creds.
      await resolved.provider.fetchOrderPaymentDetails(1)
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://org.example.test/graphql',
        expect.anything(),
      )
    }
  })

  it('returns the unconfigured soft-fail shape when ids are missing', async () => {
    for (const conf of [
      {},
      { checkinCustomerId: 42 },
      { checkinEventId: 7 },
      { checkinCustomerId: 0, checkinEventId: 7 },
    ]) {
      const resolved = await resolveTicketingProvider(conf)
      expect(resolved).toEqual({
        configured: false,
        provider: null,
        eventRef: null,
      })
    }
  })
})

describe('CheckinProvider — operations', () => {
  it('throws the "not configured" error when credentials are absent', async () => {
    const provider = getTicketingProvider('checkin', {})
    await expect(
      provider.fetchEventTickets({ customerId: 1, eventId: 2 }),
    ).rejects.toThrow(/not configured/i)
  })

  it('validates event/customer ids before any network call', async () => {
    const fetchSpy = stubCheckinFetch({})
    vi.stubGlobal('fetch', fetchSpy)
    const provider = getTicketingProvider('checkin', CREDS)

    await expect(
      provider.fetchEventTickets({ customerId: 0, eventId: 2 }),
    ).rejects.toThrow(/customer ID/i)
    await expect(
      provider.fetchEventTickets({ customerId: 1, eventId: 0 }),
    ).rejects.toThrow(/event ID/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('merges order dates onto tickets', async () => {
    const fetchSpy = stubCheckinFetch({
      eventTickets: [
        { id: 1, order_id: 100, category: 'Conf', sum: '1000' },
        { id: 2, order_id: 200, category: 'Conf', sum: '1000' },
      ],
      allEventOrderUsers: {
        data: [{ id: 9, orderId: 100, eventId: 7, createdAt: '2026-01-01' }],
        hasNextPage: false,
      },
    })
    vi.stubGlobal('fetch', fetchSpy)

    const tickets = await getTicketingProvider(
      'checkin',
      CREDS,
    ).fetchEventTickets({ customerId: 42, eventId: 7 })

    expect(tickets.map((t) => t.order_date)).toEqual(['2026-01-01', ''])
  })

  it('fetchPublicTicketTypes maps the event + ticket list', async () => {
    const fetchSpy = stubCheckinFetch({
      findEventById: {
        id: 7,
        name: 'CNDN',
        registrationOpensAt: null,
        registrationClosesAt: null,
        currencies: ['NOK'],
        tickets: [{ id: 1, name: 'Early', position: 0 }],
      },
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getTicketingProvider(
      'checkin',
      CREDS,
    ).fetchPublicTicketTypes(7)

    expect(result.event.name).toBe('CNDN')
    expect(result.tickets).toHaveLength(1)
  })

  it('fetchPublicTicketTypes throws when the event is missing', async () => {
    const fetchSpy = stubCheckinFetch({ findEventById: null })
    vi.stubGlobal('fetch', fetchSpy)
    await expect(
      getTicketingProvider('checkin', CREDS).fetchPublicTicketTypes(999),
    ).rejects.toThrow(/not found/i)
  })

  it('listDiscounts returns discounts + ticket types', async () => {
    const fetchSpy = stubCheckinFetch({
      discounts: {
        id: 7,
        tickets: [{ id: 1, name: 'A', description: null }],
        settings: { discounts: [{ triggerValue: 'SPONSOR' }] },
      },
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getTicketingProvider('checkin', CREDS).listDiscounts(7)
    expect(result.discounts).toHaveLength(1)
    expect(result.ticketTypes).toHaveLength(1)
  })
})

describe('CheckinProvider — verifyWebhook', () => {
  const payload: CheckinWebhookPayload = {
    payloadId: 'p1',
    event: 'event-order-created',
    dataType: 'order',
    data: {
      id: 1,
      eventId: 7,
      users: [],
      orderContact: {
        crm: {
          id: 1,
          firstName: 'A',
          lastName: 'B',
          email: { email: 'a@b.no' },
        },
      },
    },
  }
  const rawBody = JSON.stringify(payload)

  function sign(secret: string): string {
    return createHmac('sha256', secret)
      .update(JSON.stringify(payload.data))
      .digest('hex')
  }

  it('accepts a valid HMAC over the payload data field', () => {
    const provider = getTicketingProvider('checkin', CREDS)
    const headers = new Headers({
      'checkin-signature': sign(CREDS.webhookSecret),
    })
    expect(provider.verifyWebhook(rawBody, headers)).toEqual({ verified: true })
  })

  it('rejects an invalid HMAC', () => {
    const provider = getTicketingProvider('checkin', CREDS)
    const headers = new Headers({ 'checkin-signature': sign('wrong-secret') })
    expect(provider.verifyWebhook(rawBody, headers)).toEqual({
      verified: false,
      reason: 'invalid-signature',
    })
  })

  it('rejects a missing signature header', () => {
    const provider = getTicketingProvider('checkin', CREDS)
    expect(provider.verifyWebhook(rawBody, new Headers())).toEqual({
      verified: false,
      reason: 'invalid-signature',
    })
  })

  it('reports not-configured when no webhook secret was injected', () => {
    const provider = getTicketingProvider('checkin', {
      apiKey: 'k',
      apiSecret: 's',
    })
    const headers = new Headers({ 'checkin-signature': 'anything' })
    expect(provider.verifyWebhook(rawBody, headers)).toEqual({
      verified: false,
      reason: 'not-configured',
    })
  })

  it('parseOrderCreated returns data for order-created, null otherwise', () => {
    const provider = getTicketingProvider('checkin', CREDS)
    expect(provider.parseOrderCreated(payload)).toBe(payload.data)
    expect(
      provider.parseOrderCreated({ ...payload, event: 'event-something-else' }),
    ).toBeNull()
  })
})
