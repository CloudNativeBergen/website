import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// The sign-in host decision runs for real; only its Sanity read is supplied.
const getRedirectUriSyncRow =
  vi.fn<(id: string) => Promise<RedirectUriSyncRow | null>>()
vi.mock('@/lib/domain-verification/sanity', () => ({
  getRedirectUriSyncRow: (id: string) => getRedirectUriSyncRow(id),
}))

import type { RedirectUriSyncRow } from '@/lib/domain-verification/types'
import {
  signInHost,
  signInHostsById,
} from '../../../__tests__/helpers/workshopSignIn'
import { sendWorkshopSignupInstructions } from './workshop'

const DAY = 24 * 60 * 60 * 1000

function send(window: {
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
}) {
  return sendWorkshopSignupInstructions({
    userEmail: 'attendee@example.com',
    userName: 'Ada',
    ticketCategory: 'Workshop + Conference (2 days)',
    conference: {
      title: 'Cloud Native Day',
      organizer: 'Cloud Native Bergen',
      contactEmail: 'hello@cnb.no',
      domains: ['cloudnativebergen.no'],
      ...window,
    } as never,
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
  getRedirectUriSyncRow.mockImplementation(
    signInHostsById([signInHost('cloudnativebergen.no')]),
  )
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
    expect(getRedirectUriSyncRow).toHaveBeenCalledWith(
      'domainVerification.cloudnativebergen.no',
    )
  })

  it.each([
    ['not registered with WorkOS yet', { status: null, id: null }, {}],
    ['refused by WorkOS', { status: null, id: null, error: 'WorkOS 422' }, {}],
    ['not verified', {}, { status: 'failing' as const }],
  ])(
    'leaves the link out when the main host is %s',
    async (_label, redirectUri, record) => {
      getRedirectUriSyncRow.mockImplementation(
        signInHostsById([
          signInHost('cloudnativebergen.no', record, redirectUri),
        ]),
      )
      await send({})

      expect(hrefs().filter((href) => href.includes('/workshop'))).toEqual([])
      expect(html()).not.toContain('cloudnativebergen.no/workshop')
      // The rest of the email still goes out, with the contact address.
      expect(html()).toContain('mailto:hello@cnb.no')
    },
  )

  it('leaves the link out when the sign-in read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getRedirectUriSyncRow.mockRejectedValue(new Error('sanity unavailable'))
    await send({})

    expect(hrefs().filter((href) => href.includes('/workshop'))).toEqual([])
    expect(sendMock).toHaveBeenCalledOnce()
  })
})
