/**
 * @vitest-environment node
 *
 * THE MISSING-CREDENTIALS WARNING CHANNEL MUST STAY CLEAN AND UNSPENT (#886).
 *
 * `CheckinProvider`'s constructor warns ONCE PER PROCESS when `apiKey`/
 * `apiSecret` are absent. #886 made the ticket-sold route resolve the tenant
 * before verifying, and an early draft did the pre-authentication shape read by
 * constructing a provider with an EMPTY credential bag. That was wrong twice
 * over:
 *
 *  1. FALSE ALARM. A fully configured deployment logged "Checkin API
 *     credentials not found" on the first webhook of every instance.
 *  2. THE SERIOUS ONE — it CONSUMED the once-per-process flag, so a later,
 *     genuinely unconfigured construction warned about NOTHING.
 *
 * That second one is directly adverse to the rest of this change: #886 also made
 * an unset webhook secret answer 401 instead of 500 (a distinct status would be
 * an existence oracle), which leaves the LOG as the only signal that the secret
 * is missing at all. Poisoning that channel and then muting it is the worst of
 * both.
 *
 * OWN TEST FILE ON PURPOSE. The warn-once flag is module state, so this needs a
 * process where nothing has constructed a provider yet — the assertions are
 * about the FIRST construction and would be meaningless in a file whose other
 * cases had already spent the flag.
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

const h = vi.hoisted(() => ({ fetch: vi.fn(async () => null) }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

const SECRET = 'checkin-webhook-test-secret'

type WarnSpy = { mock: { calls: unknown[][] }; mockClear: () => void }

/** Anything the provider constructor would say about missing credentials. */
function credentialWarnings(warn: WarnSpy): string[] {
  return warn.mock.calls
    .map((call) => String(call[0]))
    .filter((line) => /Checkin API credentials not found/i.test(line))
}

describe('checkin ticket-sold — the credentials warning is neither faked nor spent', () => {
  let warn: WarnSpy

  beforeEach(() => {
    vi.clearAllMocks()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // FULLY CONFIGURED: all three Checkin variables present, so a provider
    // constructed from the resolved credentials has nothing to complain about.
    process.env.CHECKIN_API_KEY = 'key'
    process.env.CHECKIN_API_SECRET = 'secret'
    process.env.CHECKIN_WEBHOOK_SECRET = SECRET
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')

    mockGetTenant.mockResolvedValue({
      tenant: {
        _id: 'conf-1',
        organization: { _ref: 'org-platform' },
        ticketingProvider: null,
      },
      error: null,
    })
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-1',
        title: 'CNDN',
        organization: { _ref: 'org-platform' },
      },
      error: null,
    })
  })

  afterEach(() => {
    delete process.env.CHECKIN_API_KEY
    delete process.env.CHECKIN_API_SECRET
    delete process.env.CHECKIN_WEBHOOK_SECRET
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('a fully configured first delivery emits NO credentials warning, and leaves the once-per-process warning UNSPENT', async () => {
    const { POST } =
      await import('@/app/api/webhooks/checkin/ticket-sold/route')

    const data = {
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
    }
    const payload = {
      payloadId: 'p-1',
      event: 'event-order-created',
      dataType: 'order',
      data,
    }
    const signature = crypto
      .createHmac('sha256', SECRET)
      .update(JSON.stringify(data))
      .digest('hex')

    const response = await POST(
      new NextRequest(
        'http://localhost:3000/api/webhooks/checkin/ticket-sold',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'checkin-signature': signature,
          },
          body: JSON.stringify(payload),
        },
      ),
    )

    // The delivery authenticated — so the route really did run the whole path,
    // and an absent warning is not an absent request.
    expect(response.status).toBe(200)
    expect(mockGetTenant).toHaveBeenCalledWith(42)

    // (1) NO FALSE ALARM.
    expect(credentialWarnings(warn)).toEqual([])

    // (2) THE FLAG IS STILL THERE FOR WHOEVER NEEDS IT. A genuinely
    //     unconfigured construction — the case the warning exists for — must
    //     still be able to say so.
    //
    //     THE SPY IS CLEARED FIRST, and this is load-bearing. Counting warnings
    //     across the whole test instead would let the route's OWN false alarm
    //     satisfy this assertion: under the empty-bag regression the total is 1
    //     either way, so a `toHaveLength(1)` over the uncleared spy passes while
    //     the real misconfiguration is silent. (Verified: with (1) removed, that
    //     weaker form passed under sabotage.) Clearing scopes the count to the
    //     construction below, so this fails when — and only when — the flag has
    //     already been spent.
    warn.mockClear()
    const { CheckinProvider } = await import('@/lib/tickets/provider/checkin')
    new CheckinProvider({})
    expect(credentialWarnings(warn)).toHaveLength(1)
  })
})
