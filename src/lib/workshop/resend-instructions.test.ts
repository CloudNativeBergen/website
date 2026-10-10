/**
 * @vitest-environment node
 *
 * The organizer's "resend sign-up instructions" (#1298): tickets sold while the
 * main host could not sign in got the instructions WITHOUT the portal link, and
 * nothing sends them again. This sends every workshop ticket holder the
 * instructions with the link — only once the link works, and at most once an
 * hour per conference.
 *
 * Boundaries supplied: the sign-in decision (`workshopPortalUrl`, tested in
 * `sign-in.test.ts`), the ticket list, the live ticket-type roles read, and the
 * email sender. The recipient rule and the rate limit run for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TicketCandidate } from '@/lib/tickets/speakerStatus'

const workshopPortalUrl = vi.fn<() => Promise<string | null>>()
vi.mock('./sign-in', () => ({ workshopPortalUrl: () => workshopPortalUrl() }))

const fetchEventTicketCandidates =
  vi.fn<() => Promise<TicketCandidate[] | null>>()
vi.mock('@/lib/tickets/speakerStatus', () => ({
  fetchEventTicketCandidates: () => fetchEventTicketCandidates(),
}))

const ROLES = [
  { typeName: 'Workshop + Conference', grantsWorkshop: true },
  { typeName: 'Conference only', grantsWorkshop: false },
]
const liveRoles = vi.fn(async () => ROLES)
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async () => ({ ticketTypeRoles: await liveRoles() }),
  },
}))

const send = vi.fn<
  (
    request: Record<string, unknown>,
  ) => Promise<{ data: { emailId: string }; error: unknown }>
>(async () => ({
  data: { emailId: 'em' },
  error: undefined as unknown,
}))
vi.mock('@/lib/email/workshop', () => ({
  sendWorkshopSignupInstructions: (request: Record<string, unknown>) =>
    send(request),
}))

const { resendWorkshopSignupInstructions, __resetResendRateLimit } =
  await import('./resend-instructions')

const PORTAL = 'https://2026.cloudnativedays.no/workshop'
const HOUR = 60 * 60 * 1000

const conference = {
  _id: 'conference-1',
  title: 'CNDN 2026',
  domains: ['2026.cloudnativedays.no'],
  organization: { _ref: 'org-1' },
} as never

function ticket(
  registeredEmail: string,
  category: string,
  name = 'Ada Lovelace',
): TicketCandidate {
  return {
    ticketId: Math.floor(Math.random() * 1e6),
    orderId: 1,
    name,
    email: registeredEmail.trim().toLowerCase(),
    registeredEmail,
    category,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetResendRateLimit()
  workshopPortalUrl.mockResolvedValue(PORTAL)
  fetchEventTicketCandidates.mockResolvedValue([
    ticket('ada@example.org', 'Workshop + Conference'),
    ticket('Ada@Example.org', 'Workshop + Conference'), // the same person again
    ticket('grace@example.org', 'Workshop + Conference', ''),
    ticket('linus@example.org', 'Conference only'),
  ])
})

describe('resendWorkshopSignupInstructions', () => {
  it('mails every workshop ticket holder once, with the working portal link', async () => {
    const outcome = await resendWorkshopSignupInstructions(conference, 0)

    expect(outcome).toEqual({ kind: 'sent', sent: 2, failed: 0 })
    expect(send.mock.calls.map(([request]) => request)).toEqual([
      {
        userEmail: 'ada@example.org',
        userName: 'Ada Lovelace',
        conference,
        ticketCategory: 'Workshop + Conference',
        portalUrl: PORTAL,
      },
      {
        // No name on the ticket: the address stands in.
        userEmail: 'grace@example.org',
        userName: 'grace@example.org',
        conference,
        ticketCategory: 'Workshop + Conference',
        portalUrl: PORTAL,
      },
    ])
  })

  it('refuses while the main host cannot sign in — before reading any ticket', async () => {
    workshopPortalUrl.mockResolvedValue(null)

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'portal-unavailable' })
    expect(fetchEventTicketCandidates).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses when the ticket list cannot be read, and sends nothing', async () => {
    fetchEventTicketCandidates.mockResolvedValue(null)

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'ticketing-unavailable' })
    expect(send).not.toHaveBeenCalled()
  })

  it('counts a failed send and carries on with the rest', async () => {
    send.mockResolvedValueOnce({ data: { emailId: '' }, error: 'bounced' })

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 1, failed: 1 })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('sends at most once an hour per conference — a double click sends nothing twice', async () => {
    await resendWorkshopSignupInstructions(conference, 0)
    send.mockClear()

    await expect(
      resendWorkshopSignupInstructions(conference, HOUR - 1),
    ).resolves.toEqual({ kind: 'rate-limited', retryAfterMs: 1 })
    expect(send).not.toHaveBeenCalled()

    await expect(
      resendWorkshopSignupInstructions(conference, HOUR),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('spends no hourly quota on a refusal', async () => {
    workshopPortalUrl.mockResolvedValueOnce(null)
    await resendWorkshopSignupInstructions(conference, 0)
    fetchEventTicketCandidates.mockResolvedValueOnce(null)
    await resendWorkshopSignupInstructions(conference, 1)

    await expect(
      resendWorkshopSignupInstructions(conference, 2),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('decides who holds a workshop ticket from the LIVE ticket-type roles', async () => {
    liveRoles.mockResolvedValueOnce([
      { typeName: 'Workshop + Conference', grantsWorkshop: false },
      { typeName: 'Conference only', grantsWorkshop: true },
    ])

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 1, failed: 0 })
    expect(send.mock.calls[0][0]).toMatchObject({
      userEmail: 'linus@example.org',
    })
  })
})
