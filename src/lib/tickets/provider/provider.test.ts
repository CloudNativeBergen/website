import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  getTicketingProvider,
  platformCheckinCredentials,
  platformTitoCredentials,
  resolveTicketingCredentials,
  resolveTicketingProvider,
  hasTicketingBinding,
} from './index'
import { CheckinProvider, CHECKIN_API_URL } from './checkin'
import { TitoProvider } from './tito'
import type { CheckinWebhookPayload } from './types'

const CREDS = {
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  webhookSecret: 'test-webhook-secret',
}

/**
 * The platform org's document id. The platform env credentials are handed out to
 * THIS org and no other, so every resolver case that expects env creds to flow
 * must own its conference through it. See the isolation describe block below.
 */
const PLATFORM_ORG = 'org-platform'

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

beforeEach(() => {
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG)
})

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
      organization: { _ref: PLATFORM_ORG },
    })
    expect(resolved.configured).toBe(true)
    if (resolved.configured) {
      expect(resolved.eventRef).toEqual({ customerId: 42, eventId: 7 })
      expect(resolved.provider).toBeInstanceOf(CheckinProvider)
    }
  })

  it('uses the platform env credentials for the PLATFORM ORG when it has no per-org secret', async () => {
    vi.stubEnv('CHECKIN_API_KEY', 'env-key')
    vi.stubEnv('CHECKIN_API_SECRET', 'env-secret')
    const resolved = await resolveTicketingProvider({
      checkinCustomerId: 42,
      checkinEventId: 7,
      organization: { _ref: PLATFORM_ORG },
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

  it('REGRESSION PIN: an absent ticketingProvider routes to Checkin unchanged', async () => {
    const resolved = await resolveTicketingProvider({
      // No `ticketingProvider` field at all — the legacy shape.
      checkinCustomerId: 42,
      checkinEventId: 7,
      organization: { _ref: PLATFORM_ORG },
    })
    expect(resolved.configured).toBe(true)
    if (resolved.configured) {
      expect(resolved.provider).toBeInstanceOf(CheckinProvider)
      // The eventRef stays the bare Checkin pair (no `provider` key added), so
      // every existing consumer reading `.eventId` is unaffected.
      expect(resolved.eventRef).toEqual({ customerId: 42, eventId: 7 })
    }
  })

  it('routes a tito-bound conference to a TitoProvider with a slug eventRef', async () => {
    vi.stubEnv('TITO_API_KEY', 'env-tito-token')
    const resolved = await resolveTicketingProvider({
      ticketingProvider: 'tito',
      titoAccountSlug: 'acme',
      titoEventSlug: '2026',
      organization: { _ref: PLATFORM_ORG },
    })
    expect(resolved.configured).toBe(true)
    if (resolved.configured) {
      expect(resolved.provider).toBeInstanceOf(TitoProvider)
      expect(resolved.provider.isConfigured()).toBe(true)
      expect(resolved.eventRef).toEqual({
        provider: 'tito',
        accountSlug: 'acme',
        eventSlug: '2026',
      })
    }
  })

  it('prefers a per-org Tito ticketing secret over the env token', async () => {
    vi.stubEnv('TITO_API_KEY', 'env-tito-token')
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        'org-tito': { ticketing: { apiKey: 'org-tito-token' } },
      }),
    )
    // Prove the org secret won by observing the Authorization header it sends.
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ tickets: [], meta: { next_page: null } }),
      text: async () => '',
    }))
    vi.stubGlobal('fetch', fetchSpy)

    const resolved = await resolveTicketingProvider({
      ticketingProvider: 'tito',
      titoAccountSlug: 'acme',
      titoEventSlug: '2026',
      organization: { _ref: 'org-tito' },
    })
    expect(resolved.configured).toBe(true)
    if (resolved.configured) {
      await resolved.provider.fetchEventTickets(resolved.eventRef)
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Token token=org-tito-token',
          }),
        }),
      )
    }
  })

  /**
   * CROSS-TENANT ISOLATION for ticketing credentials.
   *
   * The platform env is ONE Checkin/Tito account. A conference's
   * `checkinEventId` / `titoEventSlug` is a provider-side id no Sanity guard can
   * see, so handing that account to an arbitrary tenant makes their own binding
   * fields address the platform's account. `ticketingBindingIsClaimed` already
   * refuses a binding another conference DOCUMENT claims; an event that exists in
   * the platform account but is bound to no document is invisible to it. These
   * cases pin the source-level fix: no account, nothing to address.
   */
  describe('the platform env account is the PLATFORM ORG only', () => {
    beforeEach(() => {
      vi.stubEnv('CHECKIN_API_KEY', 'env-key')
      vi.stubEnv('CHECKIN_API_SECRET', 'env-secret')
      vi.stubEnv('TITO_API_KEY', 'env-tito-token')
    })

    it('gives a NON-platform tenant NO credentials, so the conference resolves UNCONFIGURED', async () => {
      expect(
        await resolveTicketingProvider({
          checkinCustomerId: 42,
          checkinEventId: 7,
          organization: { _ref: 'org-second-tenant' },
        }),
      ).toEqual({ configured: false, provider: null, eventRef: null })
    })

    it('does the same on the Tito branch', async () => {
      expect(
        await resolveTicketingProvider({
          ticketingProvider: 'tito',
          titoAccountSlug: 'acme',
          titoEventSlug: '2026',
          organization: { _ref: 'org-second-tenant' },
        }),
      ).toEqual({ configured: false, provider: null, eventRef: null })
    })

    it('FAILS CLOSED on a conference with no owning organization', async () => {
      expect(
        await resolveTicketingProvider({
          checkinCustomerId: 42,
          checkinEventId: 7,
        }),
      ).toEqual({ configured: false, provider: null, eventRef: null })
      expect(
        await resolveTicketingProvider({
          checkinCustomerId: 42,
          checkinEventId: 7,
          organization: null,
        }),
      ).toEqual({ configured: false, provider: null, eventRef: null })
    })

    it('FAILS CLOSED for every org when PLATFORM_ORG_ID is unset (local dev)', async () => {
      vi.stubEnv('PLATFORM_ORG_ID', '')
      expect(
        await resolveTicketingProvider({
          checkinCustomerId: 42,
          checkinEventId: 7,
          organization: { _ref: PLATFORM_ORG },
        }),
      ).toEqual({ configured: false, provider: null, eventRef: null })
    })

    it('KEEPS the platform org fully credentialed (the hard constraint)', async () => {
      const resolved = await resolveTicketingProvider({
        checkinCustomerId: 42,
        checkinEventId: 7,
        organization: { _ref: PLATFORM_ORG },
      })
      expect(resolved.configured).toBe(true)
      if (resolved.configured) {
        expect(resolved.provider.isConfigured()).toBe(true)
        expect(resolved.eventRef).toEqual({ customerId: 42, eventId: 7 })
      }
    })

    it('still serves a non-platform tenant that has its OWN provisioned secret', async () => {
      vi.stubEnv(
        'TENANT_SECRETS_JSON',
        JSON.stringify({
          'org-second-tenant': {
            ticketing: { apiKey: 'own-key', apiSecret: 'own-secret' },
          },
        }),
      )
      const resolved = await resolveTicketingProvider({
        checkinCustomerId: 42,
        checkinEventId: 7,
        organization: { _ref: 'org-second-tenant' },
      })
      expect(resolved.configured).toBe(true)
      if (resolved.configured) {
        expect(resolved.provider.isConfigured()).toBe(true)
      }
    })
  })

  it('returns unconfigured when a tito conference is missing its slugs', async () => {
    for (const conf of [
      { ticketingProvider: 'tito' as const },
      { ticketingProvider: 'tito' as const, titoAccountSlug: 'acme' },
      { ticketingProvider: 'tito' as const, titoEventSlug: '2026' },
    ]) {
      expect(await resolveTicketingProvider(conf)).toEqual({
        configured: false,
        provider: null,
        eventRef: null,
      })
    }
  })
})

describe('platformTitoCredentials', () => {
  it('assembles the Tito token + webhook secret from the environment', () => {
    vi.stubEnv('TITO_API_KEY', 'tito-token')
    vi.stubEnv('TITO_WEBHOOK_SECRET', 'tito-webhook')
    expect(platformTitoCredentials()).toEqual({
      apiKey: 'tito-token',
      webhookSecret: 'tito-webhook',
    })
  })
})

/**
 * PER-ORG DISCRETE ENV VARS for ticketing (RunKonf/platform#57).
 *
 * The goal is that `TENANT_CNDN_CHECKIN_*` resolves for CNDN WITHOUT the
 * platform-org special case, so the Checkin integration can be moved to a
 * per-tenant credential independently of who owns the deployment env. Every
 * case below runs with `PLATFORM_ORG_ID` pointing at a DIFFERENT org (the file's
 * `beforeEach`), so nothing here can be passing via the platform branch.
 */
describe('resolveTicketingCredentials — per-org discrete env vars', () => {
  const CNDN = 'organization-cloud-native-days'
  const FULL = {
    TENANT_CNDN_CHECKIN_API_KEY: 'cndn-key',
    TENANT_CNDN_CHECKIN_API_SECRET: 'cndn-secret',
    TENANT_CNDN_CHECKIN_WEBHOOK_SECRET: 'cndn-webhook',
  }

  function stubVars(vars: Record<string, string>) {
    for (const name of Object.keys(FULL)) vi.stubEnv(name, '')
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v)
  }

  beforeEach(() => {
    stubVars({})
    vi.stubEnv('TENANT_SECRETS_JSON', '')
    // The platform env account is configured throughout, so every refusal below
    // is a refusal to hand out THIS, not an artefact of an empty environment.
    vi.stubEnv('CHECKIN_API_KEY', 'platform-key')
    vi.stubEnv('CHECKIN_API_SECRET', 'platform-secret')
    vi.stubEnv('CHECKIN_WEBHOOK_SECRET', 'platform-webhook')
  })

  it('serves a MAPPED, NON-platform org from its own variables', async () => {
    stubVars(FULL)
    expect(await resolveTicketingCredentials(CNDN, 'checkin')).toEqual({
      apiKey: 'cndn-key',
      apiSecret: 'cndn-secret',
      webhookSecret: 'cndn-webhook',
    })
    // The platform org is unaffected and still gets the env account.
    expect(await resolveTicketingCredentials(PLATFORM_ORG, 'checkin')).toEqual({
      apiKey: 'platform-key',
      apiSecret: 'platform-secret',
      webhookSecret: 'platform-webhook',
    })
  })

  it('resolves a full provider for that org, so the surfaces come alive', async () => {
    stubVars(FULL)
    const resolved = await resolveTicketingProvider({
      checkinCustomerId: 42,
      checkinEventId: 7,
      organization: { _ref: CNDN },
    })
    expect(resolved.configured).toBe(true)
    if (resolved.configured) {
      expect(resolved.provider.isConfigured()).toBe(true)
      expect(resolved.eventRef).toEqual({ customerId: 42, eventId: 7 })
    }
  })

  it('refuses a PARTIAL set rather than mixing in the platform account', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const omitted of Object.keys(FULL)) {
      stubVars(
        Object.fromEntries(Object.entries(FULL).filter(([k]) => k !== omitted)),
      )
      // NOT a bag with two real values and one `undefined`, and NOT the
      // platform's credentials either: a non-platform org resolves to nothing.
      expect(
        await resolveTicketingCredentials(CNDN, 'checkin'),
        `omitting ${omitted}`,
      ).toBeNull()
    }
    expect(warn).toHaveBeenCalled()

    // THE CONTROL: the full set, same env otherwise, resolves.
    stubVars(FULL)
    expect(await resolveTicketingCredentials(CNDN, 'checkin')).not.toBeNull()
  })

  it('beats a TENANT_SECRETS_JSON entry for the same org', async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ [CNDN]: { ticketing: { apiKey: 'blob-key' } } }),
    )
    // Control: with no discrete vars the blob wins.
    expect(await resolveTicketingCredentials(CNDN, 'checkin')).toEqual({
      apiKey: 'blob-key',
    })
    stubVars(FULL)
    expect(await resolveTicketingCredentials(CNDN, 'checkin')).toEqual({
      apiKey: 'cndn-key',
      apiSecret: 'cndn-secret',
      webhookSecret: 'cndn-webhook',
    })
  })

  it('never answers for a TITO conference — a Checkin key is not a Tito token', async () => {
    stubVars(FULL)
    // The discrete vars are Checkin-shaped by construction. Handing them to
    // TitoProvider would authenticate a Tito call with a Checkin key.
    expect(await resolveTicketingCredentials(CNDN, 'tito')).toBeNull()
    // The control: a Tito bag in the provider-agnostic JSON store still works.
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ [CNDN]: { ticketing: { apiKey: 'tito_secret_x' } } }),
    )
    expect(await resolveTicketingCredentials(CNDN, 'tito')).toEqual({
      apiKey: 'tito_secret_x',
    })
  })

  it('grants nothing to an UNMAPPED org, and nothing to an unresolvable one', async () => {
    stubVars(FULL)
    // Control: the mapped org resolves under this exact env.
    expect(await resolveTicketingCredentials(CNDN, 'checkin')).not.toBeNull()
    for (const orgId of ['kkdemo.org', 'org-other', `${CNDN}-2`, null, '']) {
      expect(await resolveTicketingCredentials(orgId, 'checkin')).toBeNull()
    }
  })

  it('leaves an org with no per-org vars resolving exactly as before', async () => {
    // No discrete vars, no blob: the platform org keeps the env account and
    // everyone else keeps getting nothing. This is today's behaviour verbatim.
    expect(await resolveTicketingCredentials(PLATFORM_ORG, 'checkin')).toEqual({
      apiKey: 'platform-key',
      apiSecret: 'platform-secret',
      webhookSecret: 'platform-webhook',
    })
    expect(await resolveTicketingCredentials(CNDN, 'checkin')).toBeNull()
    expect(await resolveTicketingCredentials('org-other', 'checkin')).toBeNull()
  })
})

describe('hasTicketingBinding — provider-discriminated', () => {
  it('checks Checkin ids when the provider is absent/checkin', () => {
    expect(
      hasTicketingBinding({ checkinCustomerId: 1, checkinEventId: 2 }),
    ).toBe(true)
    expect(hasTicketingBinding({ checkinCustomerId: 1 })).toBe(false)
  })
  it('checks Tito slugs when the provider is tito', () => {
    expect(
      hasTicketingBinding({
        ticketingProvider: 'tito',
        titoAccountSlug: 'acme',
        titoEventSlug: '2026',
      }),
    ).toBe(true)
    // Checkin ids do NOT satisfy a tito-bound conference.
    expect(
      hasTicketingBinding({
        ticketingProvider: 'tito',
        checkinCustomerId: 1,
        checkinEventId: 2,
      }),
    ).toBe(false)
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
