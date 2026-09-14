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
const subject = () => sendMock.mock.calls[0][0].subject as string

beforeEach(() => {
  vi.clearAllMocks()
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
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
