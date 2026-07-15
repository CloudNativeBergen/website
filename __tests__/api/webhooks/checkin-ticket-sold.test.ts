/**
 * @vitest-environment node
 *
 * HMAC signature verification tests for the Checkin ticket-sold webhook
 * (src/app/api/webhooks/checkin/ticket-sold/route.ts). The route authenticates
 * inbound webhooks with an HMAC-SHA256 over `JSON.stringify(payload.data)`
 * compared via `crypto.timingSafeEqual`. These tests use the REAL HMAC to mint a
 * valid signature and assert the accept/reject behaviour at each boundary.
 */
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const mockSendWorkshop = vi.fn()
const mockGetConference = vi.fn()

vi.mock('@/lib/email/workshop', () => ({
  sendWorkshopSignupInstructions: (...args: unknown[]) =>
    mockSendWorkshop(...args),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceByCheckinEventId: (...args: unknown[]) =>
    mockGetConference(...args),
}))

const SECRET = 'checkin-webhook-test-secret'

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
  })

  afterEach(() => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
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
      conference: { _id: 'conf-1', title: 'CNDN' },
      error: null,
    })
    mockSendWorkshop.mockResolvedValue({
      data: { emailId: 'em-1' },
      error: null,
    })

    const data = makeData({
      users: [
        {
          id: 1,
          crm: {
            id: 2,
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: { email: 'ada@example.com' },
          },
          ticket: { id: 3, name: 'Speaker ticket', type: 'speaker' },
          isPaid: true,
        },
      ],
    })
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
