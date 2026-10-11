import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('./config', () => ({
  resend: { emails: { send: (...args: unknown[]) => sendMock(...args) } },
  resolveEmailSender: async () => ({
    client: { emails: { send: (...args: unknown[]) => sendMock(...args) } },
  }),
  retryWithBackoff: (fn: () => Promise<unknown>) => fn(),
  createEmailError: (message: string, status = 500) => ({
    error: message,
    status,
  }),
}))

// The destination check runs for real; only its Sanity read is supplied.
const getDomainClaim = vi.fn<(id: string) => Promise<DomainClaim | null>>()
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: (id: string) => getDomainClaim(id),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: vi.fn(),
}))

import type { DomainClaim } from '@/lib/domain-verification/types'
import {
  claimsById,
  provenClaim,
} from '../../../__tests__/helpers/domainClaims'
import { sendWorkshopSignupInstructions } from './workshop'
import { workshopPortalUrl } from '@/lib/workshop/sign-in'

const DAY = 24 * 60 * 60 * 1000

/**
 * Send as the ticket-sold webhook does: the portal link decided by the real
 * rule (`workshopPortalUrl`, only its Sanity read supplied), then the email.
 */
async function send(window: {
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
}) {
  const conference = {
    title: 'Cloud Native Day',
    organizer: 'Cloud Native Bergen',
    contactEmail: 'hello@cnb.no',
    domains: ['cloudnativebergen.no'],
    ...window,
  } as never
  return sendWorkshopSignupInstructions({
    userEmail: 'attendee@example.com',
    userName: 'Ada',
    ticketCategory: 'Workshop + Conference (2 days)',
    conference,
    portalUrl: await workshopPortalUrl(conference),
  })
}

const html = () => sendMock.mock.calls[0][0].html as string
/** Every `href` in the rendered email. */
const hrefs = () =>
  [...html().matchAll(/href="([^"]*)"/g)].map((match) => match[1])
const subject = () => sendMock.mock.calls[0][0].subject as string

beforeEach(() => {
  vi.clearAllMocks()
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  getDomainClaim.mockImplementation(
    claimsById(provenClaim('cloudnativebergen.no')),
  )
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sendWorkshopSignupInstructions registration gating', () => {
  it('claims registration is open when the window is open', async () => {
    await send({
      workshopRegistrationStart: new Date(Date.now() - DAY).toISOString(),
      workshopRegistrationEnd: new Date(Date.now() + DAY).toISOString(),
    })

    expect(subject()).toContain('Workshop Signup Available')
    expect(html()).toContain('Workshop Registration Now Available')
    expect(html()).toContain('Sign Up for Workshops')
  })

  it('claims registration is open when no window is configured', async () => {
    await send({})

    expect(html()).toContain('Workshop Registration Now Available')
  })

  it('does NOT claim registration is open before it starts', async () => {
    const start = new Date(Date.now() + 30 * DAY).toISOString()
    await send({ workshopRegistrationStart: start })

    expect(subject()).toContain('Workshop Signup Opens')
    expect(html()).not.toContain('Workshop Registration Now Available')
    expect(html()).not.toContain('You can now sign up')
    expect(html()).toContain('Registration is not open yet')
    // The signup page link survives — only the "sign up now" claim is gated.
    expect(html()).toContain('https://cloudnativebergen.no/workshop')
  })

  it('says when registration opens in Oslo time, whatever the server’s zone', async () => {
    await send({ workshopRegistrationStart: '2099-06-01T08:00:00Z' })

    // 08:00 UTC is 10:00 in Oslo (CEST).
    expect(subject()).toContain('Monday, June 1, 2099 at 10:00 AM')
    expect(html()).toContain('Monday, June 1, 2099 at 10:00 AM')
  })

  it('does NOT invite signup after registration has closed', async () => {
    await send({
      workshopRegistrationEnd: new Date(Date.now() - DAY).toISOString(),
    })

    expect(subject()).toContain('Workshop Signup Has Closed')
    expect(html()).toContain('registration closed on')
    expect(html()).not.toContain('Workshop Registration Now Available')
    expect(html()).not.toContain('How to register for workshops')
    expect(html()).not.toContain('first-come, first-served')
    expect(html()).toContain('hello@cnb.no')
  })
})

/**
 * THE PORTAL LINK IS ONLY SENT WHEN IT CAN WORK (#1298): the conference's main
 * host must be able to sign in. Otherwise the link would land on a page that
 * says sign-up is not available — the email leaves it out, as it already does
 * for a conference with no domain.
 */
describe('sendWorkshopSignupInstructions portal link', () => {
  it('links the portal on the main host when that host can sign in', async () => {
    await send({})

    expect(hrefs().filter((href) => href.endsWith('/workshop'))).toEqual([
      'https://cloudnativebergen.no/workshop',
      'https://cloudnativebergen.no/workshop',
    ])
    expect(getDomainClaim).toHaveBeenCalledWith(
      'domainVerification.cloudnativebergen.no',
    )
  })

  it.each([
    ['not verified', { status: 'failing' as const }, {}],
    [
      'only grandfathered',
      {
        method: 'grandfathered' as const,
        graceUntil: new Date(Date.now() + DAY).toISOString(),
      },
      {},
    ],
    ['no longer claimed by its conference', {}, { domains: [] }],
  ])(
    'leaves the link out when the main host is %s',
    async (_label, record, conference) => {
      getDomainClaim.mockImplementation(
        claimsById(provenClaim('cloudnativebergen.no', record, conference)),
      )
      await send({})

      expect(hrefs().filter((href) => href.includes('/workshop'))).toEqual([])
      expect(html()).not.toContain('cloudnativebergen.no/workshop')
      // The rest of the email still goes out, with the contact address —
      // and without claiming the attendee can sign up now (review of #1298).
      expect(html()).toContain('mailto:hello@cnb.no')
      expect(subject()).not.toContain('Workshop Signup Available')
      expect(html()).not.toContain('You can now sign up')
      expect(html()).not.toContain('How to register for workshops')
      expect(html()).toContain('Online workshop sign-up is not available yet')
    },
  )

  it('leaves the link out when the sign-in read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getDomainClaim.mockRejectedValue(new Error('sanity unavailable'))
    await send({})

    expect(hrefs().filter((href) => href.includes('/workshop'))).toEqual([])
    expect(sendMock).toHaveBeenCalledOnce()
  })
})

describe('sendWorkshopSignupInstructions without a portal link', () => {
  it('does not announce registration as open, and points to the organizers', async () => {
    getDomainClaim.mockResolvedValue(null)
    await send({
      workshopRegistrationStart: new Date(Date.now() - DAY).toISOString(),
    })

    expect(subject()).toBe('Workshop Signup Coming Soon - Cloud Native Day')
    expect(html()).toContain('Workshop Registration Coming Soon')
    expect(html()).toContain('Online workshop sign-up is not available yet')
    expect(html()).not.toContain('first-come, first-served')
    expect(html()).toContain('mailto:hello@cnb.no')
  })

  it('still says when registration opens, if that is later', async () => {
    getDomainClaim.mockResolvedValue(null)
    const start = new Date(Date.now() + 30 * DAY).toISOString()
    await send({ workshopRegistrationStart: start })

    expect(html()).toContain('Online workshop sign-up is not available yet')
    expect(html()).toContain('Registration opens on')
  })

  it('keeps the closed copy when registration has closed', async () => {
    getDomainClaim.mockResolvedValue(null)
    await send({
      workshopRegistrationEnd: new Date(Date.now() - DAY).toISOString(),
    })

    expect(subject()).toContain('Workshop Signup Has Closed')
    expect(html()).not.toContain('Online workshop sign-up is not available yet')
  })
})
