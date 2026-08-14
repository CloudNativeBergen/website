/**
 * @vitest-environment node
 *
 * HMAC signature verification tests for the Checkin ticket-sold webhook
 * (src/app/api/webhooks/checkin/ticket-sold/route.ts). The route authenticates
 * inbound webhooks with an HMAC-SHA256 over `JSON.stringify(payload.data)`
 * compared via `crypto.timingSafeEqual`. These tests use the REAL HMAC to mint a
 * valid signature and assert the accept/reject behaviour at each boundary.
 *
 * Plus the WORKSHOP FEATURE GATE (#689): this webhook is what automatically
 * emails an attendee a link into the workshop portal, so for any tenant the
 * portal is not enabled for it must send NOTHING. The gate runs against the
 * REAL entitlement resolver with only the organization document mocked.
 *
 * Plus PER-TENANT VERIFICATION (#886): the signature is checked against the
 * credentials of the conference the delivery names, not against the platform's.
 * `resolveTicketingCredentials` runs FOR REAL in every case below — the only
 * thing mocked is the Sanity lookup that names the tenant — so a regression that
 * reintroduced the platform secret would have to survive the real resolver.
 */
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const mockSendWorkshop = vi.fn()
const mockGetConference = vi.fn()
const mockGetTenant = vi.fn()
const mockGetOrganizationById = vi.fn()

vi.mock('@/lib/email/workshop', () => ({
  sendWorkshopSignupInstructions: (...args: unknown[]) =>
    mockSendWorkshop(...args),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceByCheckinEventId: (...args: unknown[]) =>
    mockGetConference(...args),
  getConferenceTenantByCheckinEventId: (...args: unknown[]) =>
    mockGetTenant(...args),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

/**
 * The platform-org grant is an ID comparison against the configured
 * `PLATFORM_ORG_ID` (RunKonf/platform#43) — pure env, no Sanity read and never
 * the cached org document's `slug`. A case OPTS IN to being the platform org by
 * pointing `PLATFORM_ORG_ID` at the conference owner's id. This mock is a
 * TRIPWIRE: a reintroduced slug lookup would call it and trip the no-fetch guard.
 */
const h = vi.hoisted(() => ({ fetch: vi.fn(async () => null) }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

const SECRET = 'checkin-webhook-test-secret'
const PLATFORM_SLUG = 'platform-org'

/**
 * A second Checkin account's webhook secret. DIFFERENT from {@link SECRET} on
 * purpose: every assertion about per-tenant verification below turns on which of
 * these two values was used, so a fallback to the platform secret changes an
 * outcome rather than merely failing to be observed.
 */
const TENANT_SECRET = 'tenant-two-owns-this-checkin-account'

/** `TENANT_SECRETS_JSON` giving the non-platform tenants their own account. */
const TENANT_SECRETS_JSON = JSON.stringify({
  'org-tenant2': { ticketing: { webhookSecret: TENANT_SECRET } },
  'org-ghost': { ticketing: { webhookSecret: TENANT_SECRET } },
  'org-pilot': { ticketing: { webhookSecret: TENANT_SECRET } },
})

/** A conference owned by `orgId` — the tenant key the feature gate reads. */
function conferenceOwnedBy(orgId: string | null) {
  return {
    _id: 'conf-1',
    title: 'CNDN',
    ...(orgId ? { organization: { _ref: orgId, _type: 'reference' } } : {}),
  }
}

/**
 * Point BOTH Sanity lookups at the same conference: the pre-authentication
 * tenant projection (which decides whose secret verifies the delivery) and the
 * post-authentication full document read.
 */
function bindConferenceTo(orgId: string | null, extra = {}) {
  const conference = { ...conferenceOwnedBy(orgId), ...extra }
  mockGetTenant.mockResolvedValue({
    tenant: {
      _id: conference._id,
      organization: conference.organization ?? null,
      ticketingProvider:
        (extra as { ticketingProvider?: string }).ticketingProvider ?? null,
    },
    error: null,
  })
  mockGetConference.mockResolvedValue({ conference, error: null })
  return conference
}

/** One workshop-eligible ticket buyer. */
function workshopBuyer() {
  return {
    id: 1,
    crm: {
      id: 2,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: { email: 'ada@example.com' },
    },
    ticket: { id: 3, name: 'Speaker ticket', type: 'speaker' },
    isPaid: true,
  }
}

function sign(data: unknown, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(data))
    .digest('hex')
}

function makeData(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eventId: 42,
    users: [],
    orderContact: {
      crm: {
        id: 9,
        firstName: 'Order',
        lastName: 'Contact',
        email: { email: 'order@example.com' },
      },
    },
    ...overrides,
  }
}

function makePayload(data: unknown, event = 'event-order-created') {
  return {
    payloadId: 'p-1',
    event,
    dataType: 'order',
    data,
  }
}

function postRequest(payload: unknown, signature: string | null): NextRequest {
  return new NextRequest(
    'http://localhost:3000/api/webhooks/checkin/ticket-sold',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signature !== null && { 'checkin-signature': signature }),
      },
      body: JSON.stringify(payload),
    },
  )
}

describe('api/webhooks/checkin/ticket-sold — HMAC signature', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CHECKIN_WEBHOOK_SECRET = SECRET
    // Default: the conference belongs to the platform org, which keeps the
    // workshop feature (the behaviour these signature tests predate).
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: PLATFORM_SLUG,
    })
    // Since #886 the tenant is resolved BEFORE verification, so every case here
    // needs an owner for the credentials to come from. The platform org's
    // credentials are the `CHECKIN_*` env — exactly what these tests sign with.
    bindConferenceTo('org-platform')
  })

  afterEach(() => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
    vi.unstubAllEnvs()
  })

  it('accepts a request with a valid signature', async () => {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    // Empty users → the route short-circuits with 200 AFTER passing the
    // signature gate, so a 200 here proves the signature was accepted.
    const data = makeData({ users: [] })
    const payload = makePayload(data)
    const response = await POST(postRequest(payload, sign(data, SECRET)))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  it('processes the order when the signature is valid (full happy path)', async () => {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    bindConferenceTo('org-platform')
    mockSendWorkshop.mockResolvedValue({
      data: { emailId: 'em-1' },
      error: null,
    })

    const data = makeData({ users: [workshopBuyer()] })
    const payload = makePayload(data)
    const response = await POST(postRequest(payload, sign(data, SECRET)))

    expect(response.status).toBe(200)
    expect(mockGetConference).toHaveBeenCalledWith(42)
    expect(mockSendWorkshop).toHaveBeenCalledTimes(1)
  })

  it('rejects a request with a missing signature header (401)', async () => {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const payload = makePayload(makeData())
    const response = await POST(postRequest(payload, null))

    expect(response.status).toBe(401)
    expect(mockGetConference).not.toHaveBeenCalled()
  })

  it('rejects a request with a wrong signature (401)', async () => {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const data = makeData()
    const payload = makePayload(data)
    // Correct length, wrong bytes: a HMAC computed with a different secret.
    const wrong = sign(data, 'a-different-secret')
    const response = await POST(postRequest(payload, wrong))

    expect(response.status).toBe(401)
    expect(mockGetConference).not.toHaveBeenCalled()
  })

  it('rejects a signature of the wrong length (timingSafeEqual length-guard) (401)', async () => {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const payload = makePayload(makeData())
    // A too-short signature makes crypto.timingSafeEqual throw on the buffer
    // length mismatch; the verifier must catch it and reject (401), not 500.
    const response = await POST(postRequest(payload, 'deadbeef'))

    expect(response.status).toBe(401)
    expect(mockGetConference).not.toHaveBeenCalled()
  })

  it('rejects when the signature is valid for different data (tamper) (401)', async () => {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const signedData = makeData({ eventId: 42 })
    const tamperedData = makeData({ eventId: 999 })
    // Signature is over the original data, but we send tampered data.
    const payload = makePayload(tamperedData)
    const response = await POST(postRequest(payload, sign(signedData, SECRET)))

    expect(response.status).toBe(401)
  })

  /**
   * BEHAVIOUR CHANGE (#886). This used to be a 500 with a distinct
   * "Webhook secret not configured" body. It cannot be any more: after the
   * reorder, "not configured" is only reachable once an event id has RESOLVED to
   * a conference, so a distinct status would tell an unauthenticated caller that
   * the id it guessed exists. The operator signal moved to the server log; the
   * wire says exactly what a bad signature says. `uniform failure` below asserts
   * that byte-for-byte.
   */
  it('does not accept a delivery when the webhook secret is not configured', async () => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const data = makeData()
    const payload = makePayload(data)
    const response = await POST(postRequest(payload, sign(data, SECRET)))

    expect(response.status).toBe(401)
    // The full conference document is never read for an unverified delivery.
    expect(mockGetConference).not.toHaveBeenCalled()
  })

  it('does not accept a delivery when the webhook secret is empty', async () => {
    process.env.CHECKIN_WEBHOOK_SECRET = ''
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const data = makeData()
    const payload = makePayload(data)
    // Even a signature computed with the empty secret must not be accepted.
    const response = await POST(postRequest(payload, sign(data, '')))

    expect(response.status).toBe(401)
    expect(mockGetConference).not.toHaveBeenCalled()
  })
})

/**
 * THE SAFETY-CRITICAL HALF of #689. A signed, valid, workshop-eligible ticket
 * sale must NOT produce a workshop instructions email for a tenant whose
 * workshop portal is disabled — the link would drop the attendee into an
 * infinite sign-in loop. Silence beats a broken link.
 */
describe('api/webhooks/checkin/ticket-sold — workshop feature gate', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CHECKIN_WEBHOOK_SECRET = SECRET
    // A configured platform org that matches none of the tenants below, so a
    // case is platform ONLY when it points the contract at its own org id.
    vi.stubEnv('PLATFORM_ORG_ID', 'org-none')
    // Since #886 a non-platform tenant authenticates on its OWN webhook secret,
    // so the tenants below carry one — and it is DIFFERENT from the platform's,
    // which is what makes every 200 in this suite evidence that the tenant's own
    // key verified the delivery.
    vi.stubEnv('TENANT_SECRETS_JSON', TENANT_SECRETS_JSON)
    mockSendWorkshop.mockResolvedValue({
      data: { emailId: 'em-1' },
      error: null,
    })
  })

  afterEach(() => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
    vi.unstubAllEnvs()
  })

  /** POST a signed order with one workshop-eligible ticket. */
  async function postWorkshopTicket(secret = TENANT_SECRET) {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')
    const data = makeData({ users: [workshopBuyer()] })
    return POST(postRequest(makePayload(data), sign(data, secret)))
  }

  it('does NOT email the attendee when workshops are disabled for the tenant', async () => {
    bindConferenceTo('org-tenant2')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-tenant2',
      name: 'Tenant Two',
      slug: 'tenant-two',
      plan: 'enterprise',
    })

    const response = await postWorkshopTicket()

    expect(mockSendWorkshop).not.toHaveBeenCalled()
    // The webhook still ACKs — a 200 keeps Checkin from retrying a delivery
    // that is being intentionally dropped. It is also proof the delivery
    // AUTHENTICATED, on the tenant's own secret: an unverified one is a 401.
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.results).toEqual([])
    expect(body.message).toMatch(/sent 0 email\(s\)/)
  })

  it('REFUSES a delivery for a conference with no resolvable organization (fail closed)', async () => {
    // #886 moved this fail-closed decision one step earlier: with no owning org
    // there are no credentials to verify against, so the delivery is refused
    // rather than authenticated-then-suppressed. The email is still not sent.
    bindConferenceTo(null)

    const response = await postWorkshopTicket()

    expect(response.status).toBe(401)
    expect(mockSendWorkshop).not.toHaveBeenCalled()
    expect(mockGetOrganizationById).not.toHaveBeenCalled()
    // Never reached the full conference read either.
    expect(mockGetConference).not.toHaveBeenCalled()
  })

  it('does NOT email when the organization document is missing (fail closed)', async () => {
    bindConferenceTo('org-ghost')
    mockGetOrganizationById.mockResolvedValue(null)

    const response = await postWorkshopTicket()

    expect(response.status).toBe(200)
    expect(mockSendWorkshop).not.toHaveBeenCalled()
  })

  it('DOES email for the platform org — today’s behaviour is unchanged', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    bindConferenceTo('org-platform')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: PLATFORM_SLUG,
    })

    // Signed with the PLATFORM env secret — the platform org has no per-org
    // entry, so `resolveTicketingCredentials` layers `CHECKIN_*` back on.
    const response = await postWorkshopTicket(SECRET)

    expect(mockSendWorkshop).toHaveBeenCalledTimes(1)
    expect(mockSendWorkshop).toHaveBeenCalledWith(
      expect.objectContaining({ userEmail: 'ada@example.com' }),
    )
    expect(response.status).toBe(200)
  })

  it('DOES email a tenant granted the feature by an explicit override', async () => {
    bindConferenceTo('org-pilot')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-pilot',
      name: 'Pilot',
      slug: 'pilot',
      plan: 'community',
      featureOverrides: [{ feature: 'workshops', enabled: true }],
    })

    await postWorkshopTicket()

    expect(mockSendWorkshop).toHaveBeenCalledTimes(1)
  })
})

/**
 * PER-TENANT VERIFICATION (#886).
 *
 * The route used to verify EVERY delivery against `platformCheckinCredentials()`
 * — the platform org's `CHECKIN_*` env — before it knew which tenant the
 * delivery was for. A tenant on its own Checkin account signs with its own
 * webhook secret, so every one of its deliveries 401'd: no error surface, no
 * user-visible symptom, no workshop emails, forever.
 *
 * The two secrets in play here are DIFFERENT VALUES, so each case below turns on
 * WHICH key was used, not on whether some guard happened to refuse.
 */
describe('api/webhooks/checkin/ticket-sold — per-tenant credentials (#886)', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CHECKIN_WEBHOOK_SECRET = SECRET
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    vi.stubEnv('TENANT_SECRETS_JSON', TENANT_SECRETS_JSON)
    mockSendWorkshop.mockResolvedValue({
      data: { emailId: 'em-1' },
      error: null,
    })
    // Both tenants below are entitled to workshops, so the email is decided by
    // the signature and nothing else.
    mockGetOrganizationById.mockImplementation(async (id: string) => ({
      _id: id,
      name: id,
      slug: id,
      plan: 'community',
      featureOverrides: [{ feature: 'workshops', enabled: true }],
    }))
  })

  afterEach(() => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
    vi.unstubAllEnvs()
  })

  async function deliver(secret: string) {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')
    const data = makeData({ users: [workshopBuyer()] })
    return POST(postRequest(makePayload(data), sign(data, secret)))
  }

  it('the tenant secret and the platform secret are different values', () => {
    // If these ever converged, every assertion below would pass vacuously.
    expect(TENANT_SECRET).not.toBe(SECRET)
  })

  it('ACCEPTS a tenant delivery signed with THAT TENANT’S OWN secret', async () => {
    bindConferenceTo('org-tenant2')

    const response = await deliver(TENANT_SECRET)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.message).toMatch(/sent 1 email\(s\)/)
    expect(mockSendWorkshop).toHaveBeenCalledTimes(1)
    // The full conference document is read only on the authenticated side.
    expect(mockGetConference).toHaveBeenCalledWith(42)
  })

  it('REFUSES a tenant delivery signed with the PLATFORM secret (no fallback)', async () => {
    // THE SABOTAGE PROOF. Restore the old ordering — verify with
    // `platformCheckinCredentials()` before resolving the tenant — and this
    // delivery is accepted, an email goes out, and this test fails on a VALUE
    // (200 + one email) rather than on an absence.
    bindConferenceTo('org-tenant2')

    const response = await deliver(SECRET)

    expect(response.status).toBe(401)
    expect(mockSendWorkshop).not.toHaveBeenCalled()
    expect(mockGetConference).not.toHaveBeenCalled()
  })

  it('TENANT #1 IS UNAFFECTED: the platform org still verifies on the env secret', async () => {
    bindConferenceTo('org-platform')

    const response = await deliver(SECRET)

    expect(response.status).toBe(200)
    expect(mockSendWorkshop).toHaveBeenCalledTimes(1)
  })

  it('REFUSES a platform-org delivery signed with another tenant’s secret', async () => {
    // The isolation runs both ways: one tenant's leaked key must not inject
    // sales into another tenant's conference.
    bindConferenceTo('org-platform')

    const response = await deliver(TENANT_SECRET)

    expect(response.status).toBe(401)
    expect(mockSendWorkshop).not.toHaveBeenCalled()
  })

  it('REFUSES a tenant with NO credentials of its own (fails closed, no platform fallback)', async () => {
    // `org-stranger` has no `TENANT_SECRETS_JSON` entry and is not the platform
    // org, so `resolveTicketingCredentials` returns null. Neither secret works.
    bindConferenceTo('org-stranger')

    expect((await deliver(TENANT_SECRET)).status).toBe(401)
    expect((await deliver(SECRET)).status).toBe(401)
    expect(mockSendWorkshop).not.toHaveBeenCalled()
  })

  it('REFUSES a Checkin delivery for a conference that has moved to Tito', async () => {
    // A stale `checkinEventId` on a Tito conference would otherwise have its
    // Checkin HMAC compared against a Tito API token.
    bindConferenceTo('org-tenant2', { ticketingProvider: 'tito' })

    const response = await deliver(TENANT_SECRET)

    expect(response.status).toBe(401)
    expect(mockSendWorkshop).not.toHaveBeenCalled()
  })
})

/**
 * NO EXISTENCE ORACLE (#886).
 *
 * Resolving the tenant BEFORE authenticating means an unauthenticated caller can
 * name any Checkin event id it likes. If "no such event" looked different from
 * "bad signature" — in status, body OR headers — anyone could enumerate exactly
 * which Checkin events this deployment serves, one request per guess. These
 * cases are compared BYTE FOR BYTE rather than argued about.
 */
describe('api/webhooks/checkin/ticket-sold — uniform failure', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CHECKIN_WEBHOOK_SECRET = SECRET
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    vi.stubEnv('TENANT_SECRETS_JSON', TENANT_SECRETS_JSON)
  })

  afterEach(() => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
    vi.unstubAllEnvs()
  })

  /** Everything an HTTP caller can observe about a response, except timing. */
  async function onTheWire(response: Response) {
    return {
      status: response.status,
      body: await response.text(),
      headers: [...response.headers.entries()].sort(),
    }
  }

  async function post(signature: string, data = makeData()) {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')
    return POST(postRequest(makePayload(data), signature))
  }

  it('an unknown event id is indistinguishable from a bad signature', async () => {
    const data = makeData()
    const goodSignature = sign(data, TENANT_SECRET)

    // (a) the event id resolves to nothing
    mockGetTenant.mockResolvedValue({
      tenant: null,
      error: new Error('No conference found for checkin event ID: 42'),
    })
    const unknownEvent = await onTheWire(await post(goodSignature, data))

    // (b) the event id resolves, but the signature is wrong
    vi.clearAllMocks()
    bindConferenceTo('org-tenant2')
    const badSignature = await onTheWire(
      await post(sign(data, 'not-the-tenant-secret'), data),
    )

    expect(unknownEvent.status).toBe(401)
    expect(unknownEvent).toEqual(badSignature)
  })

  it('every pre-verification refusal is byte-identical', async () => {
    const data = makeData()
    const good = sign(data, TENANT_SECRET)

    const cases: Array<[string, () => Promise<Response>]> = [
      [
        'unknown event id',
        async () => {
          mockGetTenant.mockResolvedValue({
            tenant: null,
            error: new Error('no claimant'),
          })
          return post(good, data)
        },
      ],
      [
        'ambiguous event id (two claimants)',
        async () => {
          mockGetTenant.mockResolvedValue({
            tenant: null,
            error: new Error('claimed by 2 conferences'),
          })
          return post(good, data)
        },
      ],
      [
        'the tenant read failed',
        async () => {
          mockGetTenant.mockResolvedValue({
            tenant: null,
            error: new Error('sanity down'),
          })
          return post(good, data)
        },
      ],
      [
        'bad signature on a known event',
        async () => {
          bindConferenceTo('org-tenant2')
          return post(sign(data, 'wrong'), data)
        },
      ],
      [
        'the platform secret on a tenant that owns its own account',
        async () => {
          bindConferenceTo('org-tenant2')
          return post(sign(data, SECRET), data)
        },
      ],
      [
        'a known event whose org has no credentials',
        async () => {
          bindConferenceTo('org-stranger')
          return post(good, data)
        },
      ],
      [
        'a known event bound to another vendor',
        async () => {
          bindConferenceTo('org-tenant2', { ticketingProvider: 'tito' })
          return post(good, data)
        },
      ],
      [
        'the platform secret is unset',
        async () => {
          delete process.env.CHECKIN_WEBHOOK_SECRET
          bindConferenceTo('org-platform')
          const response = await post(sign(data, SECRET), data)
          process.env.CHECKIN_WEBHOOK_SECRET = SECRET
          return response
        },
      ],
      [
        'a malformed signature header',
        async () => {
          bindConferenceTo('org-tenant2')
          return post('deadbeef', data)
        },
      ],
      [
        'a non-numeric event id',
        async () => {
          bindConferenceTo('org-tenant2')
          return post(good, makeData({ eventId: 'not-a-number' }))
        },
      ],
    ]

    const observed: Array<[string, Awaited<ReturnType<typeof onTheWire>>]> = []
    for (const [label, run] of cases) {
      vi.clearAllMocks()
      observed.push([label, await onTheWire(await run())])
    }

    // Not merely equal to each other — equal AND a refusal. A route that 200'd
    // everything would satisfy equality alone.
    expect(observed[0][1].status).toBe(401)
    for (const [label, wire] of observed) {
      expect(`${label}: ${JSON.stringify(wire)}`).toBe(
        `${label}: ${JSON.stringify(observed[0][1])}`,
      )
    }
  })
})

/**
 * THE AMPLIFICATION BOUND (#886). The reorder buys one Sanity read on an
 * unauthenticated POST. These are the shapes that must never reach it — the only
 * bound this route actually gives, so it is asserted rather than described.
 */
describe('api/webhooks/checkin/ticket-sold — pre-filter (no unauthenticated read)', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CHECKIN_WEBHOOK_SECRET = SECRET
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    bindConferenceTo('org-platform')
  })

  afterEach(() => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
    vi.unstubAllEnvs()
  })

  async function post(payload: unknown, signature: string | null) {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')
    return POST(postRequest(payload, signature))
  }

  it('a non-order event is ACKed without a read and without verification', async () => {
    const response = await post(
      makePayload(makeData(), 'event-order-updated'),
      null,
    )

    expect(response.status).toBe(200)
    expect(mockGetTenant).not.toHaveBeenCalled()
    expect(mockGetConference).not.toHaveBeenCalled()
  })

  it('a missing signature header costs no read', async () => {
    const response = await post(makePayload(makeData()), null)

    expect(response.status).toBe(401)
    expect(mockGetTenant).not.toHaveBeenCalled()
  })

  it('a malformed signature header costs no read', async () => {
    for (const signature of ['deadbeef', 'z'.repeat(64), 'a'.repeat(63)]) {
      vi.clearAllMocks()
      const response = await post(makePayload(makeData()), signature)
      expect(response.status).toBe(401)
      expect(mockGetTenant).not.toHaveBeenCalled()
    }
  })

  it('an unusable event id costs no read', async () => {
    const data = makeData()
    const signature = sign(data, SECRET)
    for (const eventId of [
      'not-a-number',
      -1,
      0,
      1.5,
      null,
      undefined,
      Number.MAX_SAFE_INTEGER + 2,
    ]) {
      vi.clearAllMocks()
      const response = await post(makePayload(makeData({ eventId })), signature)
      expect(response.status).toBe(401)
      expect(mockGetTenant).not.toHaveBeenCalled()
    }
  })

  it('a non-object JSON body is a 400, not a 500, and costs no read', async () => {
    // `null` and `[]` are valid JSON. Under the old ordering the verifier
    // re-parsed the body inside its own try/catch and answered 401; the
    // pre-filter reads `payload.event` directly, so without the shape guard
    // these would throw into the catch-all and answer 500.
    for (const body of ['null', '[]', '7', '"a string"']) {
      vi.clearAllMocks()
      const { POST } =
        await import('@/app/api/webhooks/checkin/ticket-sold/route')
      const response = await POST(
        new NextRequest(
          'http://localhost:3000/api/webhooks/checkin/ticket-sold',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          },
        ),
      )
      expect(response.status).toBe(400)
      expect(mockGetTenant).not.toHaveBeenCalled()
    }
  })

  it('a well-formed delivery DOES reach the read (the pre-filter is not the whole guard)', async () => {
    const data = makeData()
    await post(makePayload(data), sign(data, SECRET))

    expect(mockGetTenant).toHaveBeenCalledWith(42)
  })
})
