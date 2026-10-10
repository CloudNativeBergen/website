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
 * `sign-in.test.ts`), the ticket list, the live ticket-type roles read, and
 * Resend's batch endpoint. The recipient rule, the rate limit and the email
 * rendering run for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TicketCandidate } from '@/lib/tickets/speakerStatus'

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

    await resendWorkshopSignupInstructions(conference, 0)

    const { html } = emails()[0]
    expect(html).toContain('Hi &lt;a href=&quot;x&quot;&gt;Mal&lt;/a&gt;,')
    expect(html).not.toContain('<a href="x">')
  })

  it('sends to the registered address trimmed — Resend rejects padding', async () => {
    fetchEventTicketCandidates.mockResolvedValue([
      ticket('  Ada@Example.org ', 'Workshop + Conference'),
    ])

    await resendWorkshopSignupInstructions(conference, 0)

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
      await resendWorkshopSignupInstructions(conference, 0)

      expect(logged).toHaveBeenCalledWith(
        'Workshop instructions resend: recipients rejected:',
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
    await resendWorkshopSignupInstructions(conference, 0)

    expect(fetchEventTicketCandidates).toHaveBeenCalledWith(conference, {
      fresh: true,
    })
  })

  it('says it is the sign-up link now ready — not a second purchase thank-you', async () => {
    await resendWorkshopSignupInstructions(conference, 0)

    const { html } = emails()[0]
    expect(html).toContain(
      'Here are the sign-up instructions for the workshops',
    )
    expect(html).not.toContain('Thank you for purchasing')
    expect(html).not.toContain('Welcome to')
  })

  it('sends in batches of 100, paced, each with its own idempotency key', async () => {
    fetchEventTicketCandidates.mockResolvedValue(
      Array.from({ length: 250 }, (_, n) =>
        ticket(`holder-${n}@example.org`, 'Workshop + Conference'),
      ),
    )

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
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

  it('refuses while the main host cannot sign in — before reading any ticket', async () => {
    workshopPortalUrl.mockResolvedValue(null)

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'portal-unavailable' })
    expect(fetchEventTicketCandidates).not.toHaveBeenCalled()
    expect(batchSend).not.toHaveBeenCalled()
  })

  it('refuses when the ticket list cannot be read, and sends nothing', async () => {
    fetchEventTicketCandidates.mockResolvedValue(null)

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
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
      resendWorkshopSignupInstructions(conference, 0),
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
      resendWorkshopSignupInstructions(conference, 0),
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
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 0, failed: 2, unconfirmed: 0 })
    expect(batchSend).toHaveBeenCalledTimes(1)
    await expect(
      resendWorkshopSignupInstructions(conference, 1),
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
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 0, failed: 0, unconfirmed: 2 })
    await expect(
      resendWorkshopSignupInstructions(conference, 1),
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
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 0, failed: 0, unconfirmed: 2 })
    expect(batchSend).toHaveBeenCalledTimes(3)
    await expect(
      resendWorkshopSignupInstructions(conference, 1),
    ).resolves.toMatchObject({ kind: 'rate-limited' })
  })

  it('refuses, and spends no quota, when no email sender can be resolved', async () => {
    senderAvailable.mockImplementationOnce(() => {
      throw new Error('credentials lookup failed')
    })

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'email-unavailable' })
    expect(batchSend).not.toHaveBeenCalled()
    await expect(
      resendWorkshopSignupInstructions(conference, 1),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('refuses once registration has closed, before reading any ticket', async () => {
    const closed = {
      ...(conference as object),
      workshopRegistrationEnd: new Date(-1).toISOString(),
    } as never

    await expect(resendWorkshopSignupInstructions(closed, 0)).resolves.toEqual({
      kind: 'registration-closed',
    })
    expect(fetchEventTicketCandidates).not.toHaveBeenCalled()
  })

  // Closed wins over an unavailable host: fixing the host would not help, so
  // the organizer must not be told it would. Decided before the portal lookup.
  it('says registration has closed even when the main host cannot sign in — without asking', async () => {
    workshopPortalUrl.mockResolvedValue(null)
    const closed = {
      ...(conference as object),
      workshopRegistrationEnd: new Date(-1).toISOString(),
    } as never

    await expect(resendWorkshopSignupInstructions(closed, 0)).resolves.toEqual({
      kind: 'registration-closed',
    })
    expect(workshopPortalUrl).not.toHaveBeenCalled()
  })

  it('sends nothing, and spends no quota, when nobody holds a workshop ticket', async () => {
    fetchEventTicketCandidates.mockResolvedValueOnce([
      ticket('linus@example.org', 'Conference only'),
    ])

    await expect(
      resendWorkshopSignupInstructions(conference, 0),
    ).resolves.toEqual({ kind: 'sent', sent: 0, failed: 0, unconfirmed: 0 })
    expect(batchSend).not.toHaveBeenCalled()
    await expect(
      resendWorkshopSignupInstructions(conference, 1),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('sends at most once an hour per conference — a double click sends nothing twice', async () => {
    await resendWorkshopSignupInstructions(conference, 0)
    batchSend.mockClear()

    await expect(
      resendWorkshopSignupInstructions(conference, HOUR - 1),
    ).resolves.toEqual({ kind: 'rate-limited', retryAfterMs: 1 })
    expect(batchSend).not.toHaveBeenCalled()

    await expect(
      resendWorkshopSignupInstructions(conference, HOUR),
    ).resolves.toMatchObject({ kind: 'sent', sent: 2 })
  })

  it('lets only one of two concurrent resends send', async () => {
    const outcomes = await Promise.all([
      resendWorkshopSignupInstructions(conference, 0),
      resendWorkshopSignupInstructions(conference, 0),
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
    ).resolves.toEqual({ kind: 'sent', sent: 1, failed: 0, unconfirmed: 0 })
    expect(recipients()).toEqual(['linus@example.org'])
  })
})
