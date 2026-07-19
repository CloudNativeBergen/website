import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('./config', () => ({
  resend: { emails: { send: (...args: unknown[]) => sendMock(...args) } },
  // Pass-through retry so the render path runs once, deterministically.
  retryWithBackoff: (fn: () => Promise<unknown>) => fn(),
  createEmailError: (message: string, status = 500) => ({
    error: message,
    status,
  }),
}))

import { sendWorkshopAnnouncementEmail } from './workshop'

beforeEach(() => {
  vi.clearAllMocks()
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
})

describe('sendWorkshopAnnouncementEmail', () => {
  it('renders the announcement into the email and returns the id', async () => {
    const result = await sendWorkshopAnnouncementEmail({
      userEmail: 'attendee@example.com',
      userName: 'Ada',
      conference: {
        organizer: 'Cloud Native Bergen',
        contactEmail: 'hello@cnb.no',
        domains: ['cloudnativebergen.no'],
      } as never,
      workshopTitle: 'Kubernetes Operators',
      authorName: 'Grace Hopper',
      body: 'Bring a laptop.',
    })

    expect(result.data?.emailId).toBe('email-1')
    const payload = sendMock.mock.calls[0][0]
    expect(payload.to).toEqual(['attendee@example.com'])
    expect(payload.from).toBe('Cloud Native Bergen <hello@cnb.no>')
    expect(payload.subject).toBe('Workshop Update: Kubernetes Operators')
    expect(payload.html).toContain('Bring a laptop.')
    expect(payload.html).toContain('Grace Hopper')
    expect(payload.html).toContain('Ada')
  })

  it('HTML-escapes the body and converts newlines to <br>', async () => {
    await sendWorkshopAnnouncementEmail({
      userEmail: 'attendee@example.com',
      userName: 'Ada',
      workshopTitle: 'W',
      authorName: 'Owner',
      body: 'Line 1\nBeware <script>alert("x")</script> & co',
    })

    const html = sendMock.mock.calls[0][0].html as string
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; co')
    expect(html).toContain('Line 1<br>Beware')
  })

  it('returns an error result (never throws) when Resend fails', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await sendWorkshopAnnouncementEmail({
      userEmail: 'attendee@example.com',
      userName: 'Ada',
      workshopTitle: 'W',
      authorName: 'Owner',
      body: 'hi',
    })

    expect(result.error).toBeTruthy()
    expect(result.data).toBeUndefined()
  })
})
