/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleSpeakerTicket } from '@/lib/events/handlers/speakerTicket'
import { speakerTicketCode } from '@/lib/speaker/ticket-code'
import { Action, Status } from '@/lib/proposal/types'
import type { ProposalStatusChangeEvent } from '@/lib/events/types'
import type { Speaker } from '@/lib/speaker/types'
import type { ResolvedTicketing } from '@/lib/tickets/provider'
import { createMockConference } from '../../testdata/conference'

// The ticket codes are HMAC-derived; a stable secret keeps them deterministic
// within the test run without ever asserting a hardcoded digest.
process.env.SPEAKER_TICKET_CODE_SECRET = 'speaker-ticket-test-secret'

vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: vi.fn(),
}))

vi.mock('@/lib/speaker/ticket-email', () => ({
  sendSpeakerTicketEmail: vi.fn(),
}))

vi.mock('@/lib/proposal/data/sanity', () => ({
  recordSpeakerTicketEmailed: vi.fn(),
}))

import { resolveTicketingProvider } from '@/lib/tickets/provider'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { recordSpeakerTicketEmailed } from '@/lib/proposal/data/sanity'

const mockedResolveProvider = vi.mocked(resolveTicketingProvider)
const mockedSendEmail = vi.mocked(sendSpeakerTicketEmail)
const mockedRecordEmailed = vi.mocked(recordSpeakerTicketEmailed)

const mockProvider = {
  name: 'Checkin.no',
  isConfigured: vi.fn(() => true),
  listDiscounts: vi.fn(),
  createDiscount: vi.fn(),
}

function resolvedCheckin(): ResolvedTicketing {
  return {
    configured: true,
    // Only the members the handler touches are mocked.
    provider: mockProvider as never,
    eventRef: { customerId: 99, eventId: 4242 },
  }
}

function makeSpeaker(overrides: Partial<Speaker> = {}): Speaker {
  return {
    _id: 'speaker-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    ...overrides,
  } as Speaker
}

function makeEvent(
  overrides: Partial<ProposalStatusChangeEvent> = {},
  speakers: Speaker[] = [makeSpeaker()],
): ProposalStatusChangeEvent {
  return {
    eventType: 'proposal.status.changed',
    timestamp: new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    proposal: { _id: 'proposal-1', title: 'A great talk' } as any,
    previousStatus: Status.accepted,
    newStatus: Status.confirmed,
    action: Action.confirm,
    conference: createMockConference({
      checkinCustomerId: 99,
      checkinEventId: 4242,
    }),
    speakers,
    metadata: {
      triggeredBy: { speakerId: 'speaker-1', isOrganizer: false },
      shouldNotify: true,
      domain: '2026.cloudnativedays.no',
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedResolveProvider.mockResolvedValue(resolvedCheckin())
  mockProvider.isConfigured.mockReturnValue(true)
  mockProvider.listDiscounts.mockResolvedValue({
    discounts: [],
    ticketTypes: [],
  })
  mockProvider.createDiscount.mockResolvedValue({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedSendEmail.mockResolvedValue({} as any)
  mockedRecordEmailed.mockResolvedValue(undefined)
})

afterEach(() => {
  process.env.SPEAKER_TICKET_CODE_SECRET = 'speaker-ticket-test-secret'
})

describe('handleSpeakerTicket', () => {
  it('issues a single-use 100%-off code via the ticketing provider and emails it on confirm', async () => {
    const speaker = makeSpeaker()
    await handleSpeakerTicket(makeEvent({}, [speaker]))

    const expectedCode = speakerTicketCode(speaker.email)

    expect(mockProvider.createDiscount).toHaveBeenCalledTimes(1)
    expect(mockProvider.createDiscount).toHaveBeenCalledWith({
      eventId: 4242,
      discountCode: expectedCode,
      numberOfTickets: 1,
      ticketTypes: [],
    })
    expect(expectedCode).toMatch(/^SPEAKER-[0-9A-F]{8}$/)

    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        discountCode: expectedCode,
        speaker: { name: speaker.name, email: speaker.email },
        registrationUrl: 'https://2026.cloudnativedays.no',
      }),
    )

    // Delivery marker is written only after a successful send.
    expect(mockedRecordEmailed).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).toHaveBeenCalledWith('proposal-1', {
      speakerId: speaker._id,
      email: 'ada@example.com',
      code: expectedCode,
    })
  })

  it('derives the code from the email, not the speaker id', () => {
    // Two duplicate speaker documents for the same person share one code…
    expect(speakerTicketCode('ada@example.com')).toBe(
      speakerTicketCode('  Ada@Example.com '),
    )
    // …and different secrets yield different codes (non-derivable without it).
    const withDefaultSecret = speakerTicketCode('ada@example.com')
    process.env.SPEAKER_TICKET_CODE_SECRET = 'a-rotated-secret'
    expect(speakerTicketCode('ada@example.com')).not.toBe(withDefaultSecret)
  })

  it('issues a code for each distinct speaker email on the proposal', async () => {
    const speakers = [
      makeSpeaker({ _id: 'speaker-1', email: 'a@example.com' }),
      makeSpeaker({ _id: 'speaker-2', email: 'b@example.com' }),
    ]

    await handleSpeakerTicket(makeEvent({}, speakers))

    expect(mockProvider.createDiscount).toHaveBeenCalledTimes(2)
    expect(mockedSendEmail).toHaveBeenCalledTimes(2)
  })

  it('de-duplicates by email: duplicate speaker docs sharing an address get one code and one email', async () => {
    const speakers = [
      makeSpeaker({ _id: 'speaker-1', email: 'ada@example.com' }),
      makeSpeaker({ _id: 'speaker-1-dup', email: 'Ada@Example.com' }),
      makeSpeaker({ _id: 'speaker-1-again', email: ' ada@example.com ' }),
    ]

    await handleSpeakerTicket(makeEvent({}, speakers))

    expect(mockProvider.createDiscount).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: skips entirely when the speaker was already emailed', async () => {
    const speaker = makeSpeaker()
    const existingCode = speakerTicketCode(speaker.email)
    // Both the coupon exists AND a delivery marker was recorded.
    mockProvider.listDiscounts.mockResolvedValue({
      discounts: [{ triggerValue: existingCode }],
      ticketTypes: [],
    })

    await handleSpeakerTicket(
      makeEvent(
        {
          proposal: {
            _id: 'proposal-1',
            title: 'A great talk',
            issuedSpeakerTickets: [
              {
                speakerId: speaker._id,
                email: 'ada@example.com',
                code: existingCode,
                emailedAt: '2026-01-01T00:00:00Z',
              },
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        },
        [speaker],
      ),
    )

    expect(mockProvider.createDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
    expect(mockedRecordEmailed).not.toHaveBeenCalled()
  })

  it('skips a duplicate speaker doc whose email already has a delivery marker under another id', async () => {
    const dupDoc = makeSpeaker({ _id: 'speaker-1-dup' })

    await handleSpeakerTicket(
      makeEvent(
        {
          proposal: {
            _id: 'proposal-1',
            title: 'A great talk',
            issuedSpeakerTickets: [
              {
                speakerId: 'speaker-1',
                email: 'ada@example.com',
                code: speakerTicketCode('ada@example.com'),
                emailedAt: '2026-01-01T00:00:00Z',
              },
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        },
        [dupDoc],
      ),
    )

    expect(mockProvider.createDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('resends the email without re-creating the coupon when it exists but was never emailed', async () => {
    const speaker = makeSpeaker()
    const existingCode = speakerTicketCode(speaker.email)
    // Coupon exists (previous run created it) but there is NO delivery marker,
    // meaning the earlier email never went out. Recovery = resend, no dup coupon.
    // The stored code differs in case — the vendor matches case-insensitively.
    mockProvider.listDiscounts.mockResolvedValue({
      discounts: [{ triggerValue: existingCode.toLowerCase() }],
      ticketTypes: [],
    })

    await handleSpeakerTicket(makeEvent({}, [speaker]))

    expect(mockProvider.createDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).toHaveBeenCalledWith('proposal-1', {
      speakerId: speaker._id,
      email: 'ada@example.com',
      code: existingCode,
    })
  })

  it('does not record a delivery marker and stays recoverable when the email fails after coupon creation', async () => {
    const speaker = makeSpeaker()
    mockedSendEmail.mockRejectedValue(new Error('resend down'))

    await expect(
      handleSpeakerTicket(makeEvent({}, [speaker])),
    ).resolves.toBeUndefined()

    // Coupon was created, but because the email failed we must NOT mark the
    // speaker as done — a re-trigger has to be able to resend.
    expect(mockProvider.createDiscount).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).not.toHaveBeenCalled()
  })

  it('still succeeds (email delivered) even if recording the marker fails', async () => {
    const speaker = makeSpeaker()
    mockedRecordEmailed.mockRejectedValue(new Error('sanity write failed'))

    await expect(
      handleSpeakerTicket(makeEvent({}, [speaker])),
    ).resolves.toBeUndefined()

    expect(mockProvider.createDiscount).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
  })

  it('no-ops when the conference has no ticketing binding', async () => {
    mockedResolveProvider.mockResolvedValue({
      configured: false,
      provider: null,
      eventRef: null,
    })

    await handleSpeakerTicket(makeEvent())

    expect(mockProvider.listDiscounts).not.toHaveBeenCalled()
    expect(mockProvider.createDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('no-ops (no lookups) when the provider has no API credentials', async () => {
    mockProvider.isConfigured.mockReturnValue(false)

    await handleSpeakerTicket(makeEvent())

    expect(mockProvider.listDiscounts).not.toHaveBeenCalled()
    expect(mockProvider.createDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('no-ops for a provider without a discount surface (Tito)', async () => {
    mockedResolveProvider.mockResolvedValue({
      configured: true,
      provider: { ...mockProvider, name: 'Tito' } as never,
      eventRef: { provider: 'tito', accountSlug: 'acct', eventSlug: 'evt' },
    })

    await handleSpeakerTicket(makeEvent())

    expect(mockProvider.listDiscounts).not.toHaveBeenCalled()
    expect(mockProvider.createDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('ignores non-confirm actions', async () => {
    await handleSpeakerTicket(makeEvent({ action: Action.accept }))

    expect(mockedResolveProvider).not.toHaveBeenCalled()
    expect(mockProvider.createDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('does not throw when issuing/emailing fails for a speaker', async () => {
    mockProvider.createDiscount.mockRejectedValue(new Error('provider down'))

    await expect(handleSpeakerTicket(makeEvent())).resolves.toBeUndefined()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('aborts without issuing when the existing-discount lookup fails', async () => {
    mockProvider.listDiscounts.mockRejectedValue(new Error('lookup failed'))

    await expect(handleSpeakerTicket(makeEvent())).resolves.toBeUndefined()
    expect(mockProvider.createDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('aborts without issuing when no code-derivation secret is configured', async () => {
    const authSecret = process.env.AUTH_SECRET
    delete process.env.SPEAKER_TICKET_CODE_SECRET
    delete process.env.AUTH_SECRET

    try {
      await expect(handleSpeakerTicket(makeEvent())).resolves.toBeUndefined()
      expect(mockProvider.createDiscount).not.toHaveBeenCalled()
      expect(mockedSendEmail).not.toHaveBeenCalled()
    } finally {
      if (authSecret !== undefined) process.env.AUTH_SECRET = authSecret
    }
  })
})
