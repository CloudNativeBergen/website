/**
 * @vitest-environment node
 *
 * The organizer's reminder (#1334, spec `docs/WORKSHOP_TICKETS_SPEC.md` §7):
 * every workshop ticket holder who has not signed up gets one email asking
 * them, conditionally, to pick their workshops. At most once an hour per
 * conference, and only while sign-up is ahead or open.
 *
 * Boundaries supplied: the sign-in decision (`workshopPortalUrl`, tested in
 * `sign-in.test.ts`), the ticket list, the Sanity reads (live roles, the
 * conference's sign-ups) and write (the last send), and Resend's batch
 * endpoint. The join, the rate limit and the email rendering run for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TicketCandidate } from '@/lib/tickets/speakerStatus'
import type { HolderSignup } from './holders'

const workshopPortalUrl = vi.fn<() => Promise<string | null>>()
vi.mock('./sign-in', () => ({ workshopPortalUrl: () => workshopPortalUrl() }))

const fetchEventTicketCandidates =
  vi.fn<
    (
      conference: unknown,
      options?: { fresh?: boolean },
    ) => Promise<TicketCandidate[] | null>
  >()
vi.mock('@/lib/tickets/speakerStatus', () => ({
  fetchEventTicketCandidates: (
    conference: unknown,
    options?: { fresh?: boolean },
  ) => fetchEventTicketCandidates(conference, options),
}))

const ticketingDenied = vi.fn(async () => false)
vi.mock('@/lib/features/ticketing', () => ({
  isTicketingDeniedForOrg: () => ticketingDenied(),
}))

const ROLES = [
  { typeName: 'Workshop + Conference', grantsWorkshop: true },
  { typeName: 'Conference only', grantsWorkshop: false },
]
const liveRoles = vi.fn(async () => ROLES)
const signups = vi.fn<() => Promise<HolderSignup[]>>(async () => [])
/** The last-send write: `patch(id).set(fields).commit()`. */
const lastSendWrite = vi.fn<
  (id: string, fields: Record<string, unknown>) => Promise<unknown>
>(async () => ({}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string) =>
      query.includes('"workshopSignup"')
        ? signups()
        : { ticketTypeRoles: await liveRoles() },
  },
  clientWrite: {
    patch: (id: string) => ({
      set: (fields: Record<string, unknown>) => ({
        commit: () => lastSendWrite(id, fields),
      }),
    }),
  },
}))

type BatchEmail = { from: string; to: string[]; subject: string; html: string }
type BatchOptions = { batchValidation?: string; idempotencyKey?: string }
type BatchResponse = {
  data: {
    data: { id: string }[]
    errors?: { index: number; message: string }[]
  } | null
  error: { name?: string; message: string; statusCode?: number | null } | null
}
const batchSend = vi.fn<
  (emails: BatchEmail[], options: BatchOptions) => Promise<BatchResponse>
>(async (emails) => ({
  data: { data: emails.map((_, i) => ({ id: `em-${i}` })), errors: [] },
  error: null,
}))
const senderAvailable = vi.fn<() => true>(() => true)
const pause = vi.fn<(ms: number) => Promise<void>>(async () => {})
// The retry policy runs for real; only the client and the pacing are supplied.
vi.mock('@/lib/email/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/config')>()),
  resolveEmailSender: async () => (
    senderAvailable(),
    {
      client: {
        batch: {
          send: (emails: BatchEmail[], options: BatchOptions) =>
            batchSend(emails, options),
        },
      },
    }
  ),
  delay: (ms: number) => pause(ms),
}))

/** Every email handed to Resend, across batches. */
const emails = () => batchSend.mock.calls.flatMap(([batch]) => batch)
/** Recipients, across batches. */
const recipients = () => emails().map((email) => email.to[0])

const { sendWorkshopReminder, __resetReminderRateLimit } = await import(
  './reminder'
)

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

function signup(
  userEmail: string,
  status: HolderSignup['status'],
): HolderSignup {
  return {
    _id: `signup-${userEmail}-${status}`,
    userEmail,
    status,
    workshop: { _id: 'workshop-1', title: 'Kubernetes' },
  }
}

/** The send with no note, as the router makes it. */
const remind = (target: never = conference, now = 0) =>
  sendWorkshopReminder(target, {}, now)

beforeEach(() => {
  vi.clearAllMocks()
  __resetReminderRateLimit()
  workshopPortalUrl.mockResolvedValue(PORTAL)
  signups.mockResolvedValue([])
  fetchEventTicketCandidates.mockResolvedValue([
    ticket('ada@example.org', 'Workshop + Conference'),
    ticket('Ada@Example.org', 'Workshop + Conference'), // the same person again
    ticket('grace@example.org', 'Workshop + Conference', ''),
    ticket('linus@example.org', 'Conference only'),
  ])
})

describe('sendWorkshopReminder', () => {
  it('mails the holders who have not signed up, once each — never a confirmed or waitlisted holder', async () => {
    fetchEventTicketCandidates.mockResolvedValue([
      ticket('ada@example.org', 'Workshop + Conference'),
      ticket('Ada@Example.org', 'Workshop + Conference'), // two tickets, one person
      ticket('grace@example.org', 'Workshop + Conference'),
      ticket('hopper@example.org', 'Workshop + Conference'),
      ticket('linus@example.org', 'Conference only'),
    ])
    signups.mockResolvedValue([
      signup('Grace@example.org', 'confirmed'),
      signup('hopper@example.org', 'waitlist'),
      // Not a holder: flagged by the join, never mailed.
      signup('linus@example.org', 'confirmed'),
    ])

    await expect(remind()).resolves.toEqual({
      kind: 'sent',
      sent: 1,
      failed: 0,
      unconfirmed: 0,
    })
    expect(recipients()).toEqual(['ada@example.org'])
  })

  it('mails every workshop ticket holder once, with the working portal link', async () => {
    const outcome = await remind(conference, 0)

    expect(outcome).toEqual({
      kind: 'sent',
      sent: 2,
      failed: 0,
      unconfirmed: 0,
    })
    expect(recipients()).toEqual(['ada@example.org', 'grace@example.org'])
    const [ada, grace] = emails()
    expect(ada.html).toContain(`href="${PORTAL}"`)
    expect(ada.html).toContain('Hi Ada Lovelace,')
    // No name on the ticket: the address stands in.
    expect(grace.html).toContain('Hi grace@example.org,')
  })

  it('escapes what the ticket provider supplies before it goes into the HTML', async () => {
    fetchEventTicketCandidates.mockResolvedValue([
      ticket(
        'mallory@example.org',
        'Workshop + Conference',
        '<a href="x">Mal</a>',
      ),
    ])

    await remind(conference, 0)

    const { html } = emails()[0]
    expect(html).toContain('Hi &lt;a href=&quot;x&quot;&gt;Mal&lt;/a&gt;,')
    expect(html).not.toContain('<a href="x">')
  })

  it('sends to the registered address trimmed — Resend rejects padding', async () => {
    fetchEventTicketCandidates.mockResolvedValue([
      ticket('  Ada@Example.org ', 'Workshop + Conference'),
    ])

    await remind(conference, 0)

    expect(recipients()).toEqual(['Ada@Example.org'])
  })

  it('logs which recipients a batch rejected, by index and reason — no address', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    batchSend.mockResolvedValueOnce({
      data: {
        data: [],
        errors: [{ index: 1, message: 'Invalid `to` field.' }],
      },
      error: null,
    })

    try {
      await remind(conference, 0)

      expect(logged).toHaveBeenCalledWith(
        'Workshop reminder: recipients rejected:',
        {
          conferenceId: 'conference-1',
          batchStart: 0,
          errors: [{ index: 1, message: 'Invalid `to` field.' }],
        },
      )
      expect(JSON.stringify(logged.mock.calls)).not.toContain('example.org')
    } finally {
      logged.mockRestore()
    }
  })

  it('reads the ticket list fresh — a ticket sold seconds ago must not be missed', async () => {
    await remind(conference, 0)

    expect(fetchEventTicketCandidates).toHaveBeenCalledWith(conference, {
      fresh: true,
    })
  })

  describe('the wording', () => {
    const OPENED = '2026-10-01T08:00:00Z'
    const CLOSES = '2026-10-20T15:00:00Z' // 17:00 in Oslo (CEST)
    const OPENS = '2026-11-02T08:00:00Z' // 09:00 in Oslo (CET)
    const DURING = Date.parse('2026-10-10T12:00:00Z')
    const open = {
      ...(conference as object),
      workshopRegistrationStart: OPENED,
      workshopRegistrationEnd: CLOSES,
    } as never
    const pending = {
      ...(conference as object),
      workshopRegistrationStart: OPENS,
      workshopRegistrationEnd: '2026-11-20T15:00:00Z',
    } as never

    async function emailFor(
      target: never,
      now: number,
      note?: string,
    ): Promise<BatchEmail> {
      batchSend.mockClear()
      __resetReminderRateLimit()
      await sendWorkshopReminder(target, { note }, now)
      return emails()[0]
    }

    it('while sign-up is open: asks conditionally and names when it closes, in the conference zone', async () => {
      const { subject, html } = await emailFor(open, DURING)

      expect(subject).toBe('Have you picked your workshops? - CNDN 2026')
      expect(html).toContain('Your ticket includes workshops.')
      expect(html).toContain('If you haven&apos;t picked your workshops yet')
      expect(html).toContain('Tuesday, October 20, 2026 at 5:00 PM')
      expect(html).toContain(`href="${PORTAL}"`)
      expect(html).not.toContain('opens on')
    })

    it('before sign-up opens: names when it opens, and no closing time', async () => {
      const { subject, html } = await emailFor(pending, DURING)

      expect(subject).toBe(
        'Workshop sign-up opens Monday, November 2, 2026 at 9:00 AM - CNDN 2026',
      )
      expect(html).toContain('If you haven&apos;t picked your workshops yet')
      expect(html).toContain('Monday, November 2, 2026 at 9:00 AM')
      expect(html).not.toContain('Friday, November 20, 2026')
      expect(html).not.toContain('closes')
    })

    it('open with no end set: makes no claim about when it closes', async () => {
      const { html } = await emailFor(
        { ...(open as object), workshopRegistrationEnd: undefined } as never,
        DURING,
      )

      expect(html).toContain('If you haven&apos;t picked your workshops yet')
      expect(html).not.toContain('closes')
    })

    // Someone can sign up between the press and the read (spec §7).
    it('never tells the recipient they have no seat, and is no purchase thank-you', async () => {
      for (const target of [open, pending]) {
        const { html } = await emailFor(target, DURING)
        expect(html).not.toMatch(/haven&apos;t signed up|not signed up|no seat/i)
        expect(html).not.toContain('Thank you for purchasing')
      }
    })

    it('shows the organizer’s note above the standard text, escaped — HTML in it is text', async () => {
      const note = 'Bring a laptop.\n<b>Doors</b> open at 8 & coffee is free'
      const { html } = await emailFor(open, DURING, note)

      expect(html).toContain(
        'Bring a laptop.<br>&lt;b&gt;Doors&lt;/b&gt; open at 8 &amp; coffee is free',
      )
      expect(html).not.toContain('<b>Doors</b>')
      expect(html.indexOf('Bring a laptop.')).toBeLessThan(
        html.indexOf('Your ticket includes workshops.'),
      )
    })

    it('with no note, the standard text is the same as with one, minus the note', async () => {
      const plain = await emailFor(open, DURING)
      const noted = await emailFor(open, DURING, 'See you there')

      expect(plain.html).not.toContain('data-organizer-note')
      expect(noted.html.replace(/\s*<div data-organizer-note[^]*?<\/div>/, '')).toBe(
        plain.html,
      )
      expect(plain.subject).toBe(noted.subject)
    })
  })

  describe('the last send, stored on the conference', () => {
    const AT = Date.parse('2026-10-10T12:00:00Z')

    it('holds the time and the number sent after a send that reached someone', async () => {
      batchSend.mockResolvedValueOnce({
        data: { data: [{ id: 'em-0' }], errors: [{ index: 1, message: 'bad' }] },
        error: null,
      })

      await expect(remind(conference, AT)).resolves.toEqual({
        kind: 'sent',
        sent: 1,
        failed: 1,
        unconfirmed: 0,
      })
      expect(lastSendWrite).toHaveBeenCalledTimes(1)
      expect(lastSendWrite).toHaveBeenCalledWith('conference-1', {
        workshopReminderLastSentAt: '2026-10-10T12:00:00.000Z',
        workshopReminderLastSentCount: 1,
      })
    })

    it.each([
      [
        'every address rejected',
        () =>
          batchSend.mockResolvedValueOnce({
            data: null,
            error: { name: 'validation_error', message: 'no', statusCode: 422 },
          }),
      ],
      [
        'the provider never answered',
        () =>
          batchSend.mockResolvedValue({
            data: null,
            error: { name: 'application_error', message: 'down', statusCode: null },
          }),
      ],
      [
        'nobody to remind',
        () => fetchEventTicketCandidates.mockResolvedValueOnce([]),
      ],
    ])('is left unchanged by a send that reached nobody: %s', async (_label, arrange) => {
      arrange()

      await expect(remind(conference, AT)).resolves.toMatchObject({
        kind: 'sent',
        sent: 0,
      })
      expect(lastSendWrite).not.toHaveBeenCalled()
      batchSend.mockReset()
    })

    it('a failing write changes nothing the organizer is told, and sends nothing again', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      lastSendWrite.mockRejectedValueOnce(new Error('Sanity is down'))

      try {
        await expect(remind(conference, AT)).resolves.toEqual({
          kind: 'sent',
          sent: 2,
          failed: 0,
          unconfirmed: 0,
        })
        expect(batchSend).toHaveBeenCalledTimes(1)
        expect(lastSendWrite).toHaveBeenCalledTimes(1)
      } finally {
        logged.mockRestore()
      }
    })
  })

  describe('refusals: the success case with one condition changed', () => {
    const closed = {
      ...(conference as object),
      workshopRegistrationEnd: new Date(-1).toISOString(),
    } as never

    it('the success case they start from sends', async () => {
      await expect(remind()).resolves.toMatchObject({ kind: 'sent', sent: 2 })
    })

    it.each<[string, () => unknown, never, string]>([
      [
        'no portal link',
        () => workshopPortalUrl.mockResolvedValue(null),
        conference,
        'portal-unavailable',
      ],
      ['registration closed', () => {}, closed, 'registration-closed'],
      [
        'no email sender',
        () =>
          senderAvailable.mockImplementationOnce(() => {
            throw new Error('credentials lookup failed')
          }),
        conference,
        'email-unavailable',
      ],
      [
        'ticketing switched off for the organization',
        () => ticketingDenied.mockResolvedValueOnce(true),
        conference,
        'ticketing-unavailable',
      ],
      [
        'a reminder within the hour',
        () => remind(conference, -1),
        conference,
        'rate-limited',
      ],
    ])('%s: sends nothing and reads no ticket', async (_label, change, target, kind) => {
      await change()
      batchSend.mockClear()
      fetchEventTicketCandidates.mockClear()

      await expect(remind(target, 0)).resolves.toMatchObject({ kind })
      expect(batchSend).not.toHaveBeenCalled()
      expect(fetchEventTicketCandidates).not.toHaveBeenCalled()
    })

    it('the sign-ups cannot be read: sends nothing, and spends no quota', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      signups.mockRejectedValueOnce(new Error('Sanity is down'))

      try {
        await expect(remind()).resolves.toEqual({
          kind: 'ticketing-unavailable',
        })
        expect(batchSend).not.toHaveBeenCalled()
        await expect(remind(conference, 1)).resolves.toMatchObject({
          kind: 'sent',
          sent: 2,
        })
      } finally {
        logged.mockRestore()
      }
    })
  })

  it('sends in batches of 100, paced, each with its own idempotency key', async () => {
    fetchEventTicketCandidates.mockResolvedValue(
      Array.from({ length: 250 }, (_, n) =>
        ticket(`holder-${n}@example.org`, 'Workshop + Conference'),
      ),
    )

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 250, failed: 0, unconfirmed: 0 })
    expect(batchSend.mock.calls.map(([batch]) => batch.length)).toEqual([
      100, 100, 50,
    ])
    expect(new Set(recipients()).size).toBe(250)
    const options = batchSend.mock.calls.map(([, opts]) => opts)
    expect(options.every((o) => o.batchValidation === 'permissive')).toBe(true)
    expect(new Set(options.map((o) => o.idempotencyKey)).size).toBe(3)
    expect(pause.mock.calls).toEqual([[500], [500]])
  })

  it('refuses when the ticket list cannot be read, and sends nothing', async () => {
    fetchEventTicketCandidates.mockResolvedValue(null)

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'ticketing-unavailable' })
    expect(batchSend).not.toHaveBeenCalled()
  })

  it('counts a rejected address and a failed batch, and carries on', async () => {
    fetchEventTicketCandidates.mockResolvedValue(
      Array.from({ length: 150 }, (_, n) =>
        ticket(`holder-${n}@example.org`, 'Workshop + Conference'),
      ),
    )
    batchSend
      .mockResolvedValueOnce({
        data: { data: [], errors: [{ index: 3, message: 'invalid to' }] },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'down' } })

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 99, failed: 51, unconfirmed: 0 })
  })

  it('retries a batch after a network blip, under the same idempotency key', async () => {
    batchSend.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'application_error',
        message: 'Unable to fetch data. The request could not be resolved.',
        statusCode: null,
      },
    })

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 2, failed: 0, unconfirmed: 0 })
    const keys = batchSend.mock.calls.map(([, opts]) => opts.idempotencyKey)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('does not retry a rejected batch, and a send that reached nobody spends no quota', async () => {
    batchSend.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'validation_error',
        message: 'Invalid from',
        statusCode: 422,
      },
    })

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 0, failed: 2, unconfirmed: 0 })
    expect(batchSend).toHaveBeenCalledTimes(1)
    await expect(
      remind(conference, 1),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('keeps the hour when the provider never answered — those emails may have gone', async () => {
    const unanswered: BatchResponse = {
      data: null,
      error: {
        name: 'application_error',
        message: 'Unable to fetch data.',
        statusCode: null,
      },
    }
    // Every retry attempt (EMAIL_CONFIG.MAX_RETRIES) goes unanswered.
    batchSend
      .mockResolvedValueOnce(unanswered)
      .mockResolvedValueOnce(unanswered)
      .mockResolvedValueOnce(unanswered)

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 0, failed: 0, unconfirmed: 2 })
    await expect(
      remind(conference, 1),
    ).resolves.toMatchObject({ kind: 'rate-limited' })
  })

  it('treats a batch Resend is still processing as unconfirmed, never rejected', async () => {
    const inFlight: BatchResponse = {
      data: null,
      error: {
        name: 'concurrent_idempotent_requests',
        message:
          'Same idempotency key used while original request is in progress',
        statusCode: 409,
      },
    }
    batchSend
      .mockResolvedValueOnce(inFlight)
      .mockResolvedValueOnce(inFlight)
      .mockResolvedValueOnce(inFlight)

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 0, failed: 0, unconfirmed: 2 })
    expect(batchSend).toHaveBeenCalledTimes(3)
    await expect(
      remind(conference, 1),
    ).resolves.toMatchObject({ kind: 'rate-limited' })
  })

  it('refuses, and spends no quota, when no email sender can be resolved', async () => {
    senderAvailable.mockImplementationOnce(() => {
      throw new Error('credentials lookup failed')
    })

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'email-unavailable' })
    expect(batchSend).not.toHaveBeenCalled()
    await expect(
      remind(conference, 1),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('says registration has closed even when the main host cannot sign in — without asking', async () => {
    workshopPortalUrl.mockResolvedValue(null)
    const closed = {
      ...(conference as object),
      workshopRegistrationEnd: new Date(-1).toISOString(),
    } as never

    await expect(remind(closed, 0)).resolves.toEqual({
      kind: 'registration-closed',
    })
    expect(workshopPortalUrl).not.toHaveBeenCalled()
  })

  it('sends nothing, and spends no quota, when nobody holds a workshop ticket', async () => {
    fetchEventTicketCandidates.mockResolvedValueOnce([
      ticket('linus@example.org', 'Conference only'),
    ])

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 0, failed: 0, unconfirmed: 0 })
    expect(batchSend).not.toHaveBeenCalled()
    await expect(
      remind(conference, 1),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('sends at most once an hour per conference — a double click sends nothing twice', async () => {
    await remind(conference, 0)
    batchSend.mockClear()

    await expect(
      remind(conference, HOUR - 1),
    ).resolves.toEqual({ kind: 'rate-limited', retryAfterMs: 1 })
    expect(batchSend).not.toHaveBeenCalled()

    await expect(
      remind(conference, HOUR),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('lets only one of two concurrent presses send', async () => {
    const outcomes = await Promise.all([
      remind(conference, 0),
      remind(conference, 0),
    ])

    expect(outcomes).toContainEqual({
      kind: 'sent',
      sent: 2,
      failed: 0,
      unconfirmed: 0,
    })
    expect(outcomes).toContainEqual({
      kind: 'rate-limited',
      retryAfterMs: HOUR,
    })
    expect(recipients()).toEqual(['ada@example.org', 'grace@example.org'])
  })

  it('spends no hourly quota on a refusal', async () => {
    workshopPortalUrl.mockResolvedValueOnce(null)
    await remind(conference, 0)
    fetchEventTicketCandidates.mockResolvedValueOnce(null)
    await remind(conference, 1)

    await expect(
      remind(conference, 2),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('decides who holds a workshop ticket from the LIVE ticket-type roles', async () => {
    liveRoles.mockResolvedValueOnce([
      { typeName: 'Workshop + Conference', grantsWorkshop: false },
      { typeName: 'Conference only', grantsWorkshop: true },
    ])

    await expect(
      remind(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 1, failed: 0, unconfirmed: 0 })
    expect(recipients()).toEqual(['linus@example.org'])
  })
})
