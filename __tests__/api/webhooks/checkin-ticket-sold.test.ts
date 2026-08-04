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
 */
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const mockSendWorkshop = vi.fn()
const mockGetConference = vi.fn()
const mockGetOrganizationById = vi.fn()

vi.mock('@/lib/email/workshop', () => ({
  sendWorkshopSignupInstructions: (...args: unknown[]) =>
    mockSendWorkshop(...args),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceByCheckinEventId: (...args: unknown[]) =>
    mockGetConference(...args),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

/**
 * The UNCACHED slug→id read behind `PLATFORM_ORG_SLUG` (RunKonf/platform#36).
 * The platform-org grant is an ID comparison against this LIVE read, never the
 * cached org document's `slug` — mocked at the Sanity boundary so the real
 * `isPlatformOrganization` runs, and set per test so a case has to OPT IN to
 * being the platform org.
 */
const live = vi.hoisted(() => ({ platformOrgId: null as string | null }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (_query: string, params?: Record<string, unknown>) =>
      typeof params?.slug === 'string' ? live.platformOrgId : null,
  },
}))

const SECRET = 'checkin-webhook-test-secret'
const PLATFORM_SLUG = 'platform-org'

/** A conference owned by `orgId` — the tenant key the feature gate reads. */
function conferenceOwnedBy(orgId: string | null) {
  return {
    _id: 'conf-1',
    title: 'CNDN',
    ...(orgId ? { organization: { _ref: orgId, _type: 'reference' } } : {}),
  }
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
    vi.stubEnv('PLATFORM_ORG_SLUG', PLATFORM_SLUG)
    live.platformOrgId = 'org-platform'
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: PLATFORM_SLUG,
    })
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

    mockGetConference.mockResolvedValue({
      conference: conferenceOwnedBy('org-platform'),
      error: null,
    })
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

  it('returns 500 (not accepted) when the webhook secret is not configured', async () => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const data = makeData()
    const payload = makePayload(data)
    const response = await POST(postRequest(payload, sign(data, SECRET)))

    expect(response.status).toBe(500)
    expect(mockGetConference).not.toHaveBeenCalled()
  })

  it('returns 500 (not accepted) when the webhook secret is empty', async () => {
    process.env.CHECKIN_WEBHOOK_SECRET = ''
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const data = makeData()
    const payload = makePayload(data)
    // Even a signature computed with the empty secret must not be accepted.
    const response = await POST(postRequest(payload, sign(data, '')))

    expect(response.status).toBe(500)
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
    vi.stubEnv('PLATFORM_ORG_SLUG', PLATFORM_SLUG)
    live.platformOrgId = null
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
  async function postWorkshopTicket() {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')
    const data = makeData({ users: [workshopBuyer()] })
    return POST(postRequest(makePayload(data), sign(data, SECRET)))
  }

  it('does NOT email the attendee when workshops are disabled for the tenant', async () => {
    mockGetConference.mockResolvedValue({
      conference: conferenceOwnedBy('org-tenant2'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-tenant2',
      name: 'Tenant Two',
      slug: 'tenant-two',
      plan: 'enterprise',
    })

    const response = await postWorkshopTicket()

    expect(mockSendWorkshop).not.toHaveBeenCalled()
    // The webhook still ACKs — a 200 keeps Checkin from retrying a delivery
    // that is being intentionally dropped.
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.results).toEqual([])
    expect(body.message).toMatch(/sent 0 email\(s\)/)
  })

  it('does NOT email when the conference has no resolvable organization (fail closed)', async () => {
    mockGetConference.mockResolvedValue({
      conference: conferenceOwnedBy(null),
      error: null,
    })

    const response = await postWorkshopTicket()

    expect(mockSendWorkshop).not.toHaveBeenCalled()
    expect(mockGetOrganizationById).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
  })

  it('does NOT email when the organization document is missing (fail closed)', async () => {
    mockGetConference.mockResolvedValue({
      conference: conferenceOwnedBy('org-ghost'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue(null)

    await postWorkshopTicket()

    expect(mockSendWorkshop).not.toHaveBeenCalled()
  })

  it('DOES email for the platform org — today’s behaviour is unchanged', async () => {
    live.platformOrgId = 'org-platform'
    mockGetConference.mockResolvedValue({
      conference: conferenceOwnedBy('org-platform'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: PLATFORM_SLUG,
    })

    const response = await postWorkshopTicket()

    expect(mockSendWorkshop).toHaveBeenCalledTimes(1)
    expect(mockSendWorkshop).toHaveBeenCalledWith(
      expect.objectContaining({ userEmail: 'ada@example.com' }),
    )
    expect(response.status).toBe(200)
  })

  it('DOES email a tenant granted the feature by an explicit override', async () => {
    mockGetConference.mockResolvedValue({
      conference: conferenceOwnedBy('org-pilot'),
      error: null,
    })
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
