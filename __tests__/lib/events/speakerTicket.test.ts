/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSpeakerTicket } from '@/lib/events/handlers/speakerTicket'
import { speakerTicketCode } from '@/lib/speaker/ticket-code'
import { Action, Status } from '@/lib/proposal/types'
import type { ProposalStatusChangeEvent } from '@/lib/events/types'
import type { Speaker } from '@/lib/speaker/types'
import { createMockConference } from '../../testdata/conference'

vi.mock('@/lib/tickets/graphql-client', () => ({
  checkinGraphQLClient: {
    isConfigured: vi.fn(() => true),
  },
}))

vi.mock('@/lib/discounts/api', () => ({
  getEventDiscounts: vi.fn(),
  createEventDiscount: vi.fn(),
}))

vi.mock('@/lib/speaker/ticket-email', () => ({
  sendSpeakerTicketEmail: vi.fn(),
}))

vi.mock('@/lib/proposal/data/sanity', () => ({
  recordSpeakerTicketEmailed: vi.fn(),
}))

import { checkinGraphQLClient } from '@/lib/tickets/graphql-client'
import { getEventDiscounts, createEventDiscount } from '@/lib/discounts/api'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { recordSpeakerTicketEmailed } from '@/lib/proposal/data/sanity'

const mockedIsConfigured = vi.mocked(checkinGraphQLClient.isConfigured)
const mockedGetEventDiscounts = vi.mocked(getEventDiscounts)
const mockedCreateEventDiscount = vi.mocked(createEventDiscount)
const mockedSendEmail = vi.mocked(sendSpeakerTicketEmail)
const mockedRecordEmailed = vi.mocked(recordSpeakerTicketEmailed)

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
    conference: createMockConference({ checkinEventId: 4242 }),
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
  mockedIsConfigured.mockReturnValue(true)
  mockedGetEventDiscounts.mockResolvedValue({ discounts: [], ticketTypes: [] })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedCreateEventDiscount.mockResolvedValue({} as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedSendEmail.mockResolvedValue({} as any)
  mockedRecordEmailed.mockResolvedValue(undefined)
})

describe('handleSpeakerTicket', () => {
  it('issues a single-use 100%-off code and emails it on confirm', async () => {
    const speaker = makeSpeaker()
    await handleSpeakerTicket(makeEvent({}, [speaker]))

    const expectedCode = speakerTicketCode(speaker._id)

    expect(mockedCreateEventDiscount).toHaveBeenCalledTimes(1)
    expect(mockedCreateEventDiscount).toHaveBeenCalledWith({
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
    expect(mockedRecordEmailed).toHaveBeenCalledWith(
      'proposal-1',
      speaker._id,
      expectedCode,
    )
  })

  it('issues a code for each speaker on the proposal', async () => {
    const speakers = [
      makeSpeaker({ _id: 'speaker-1', email: 'a@example.com' }),
      makeSpeaker({ _id: 'speaker-2', email: 'b@example.com' }),
    ]

    await handleSpeakerTicket(makeEvent({}, speakers))

    expect(mockedCreateEventDiscount).toHaveBeenCalledTimes(2)
    expect(mockedSendEmail).toHaveBeenCalledTimes(2)
  })

  it('is idempotent: skips entirely when the speaker was already emailed', async () => {
    const speaker = makeSpeaker()
    const existingCode = speakerTicketCode(speaker._id)
    // Both the coupon exists AND a delivery marker was recorded.
    mockedGetEventDiscounts.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      discounts: [{ triggerValue: existingCode } as any],
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

    expect(mockedCreateEventDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
    expect(mockedRecordEmailed).not.toHaveBeenCalled()
  })

  it('resends the email without re-creating the coupon when it exists but was never emailed', async () => {
    const speaker = makeSpeaker()
    const existingCode = speakerTicketCode(speaker._id)
    // Coupon exists (previous run created it) but there is NO delivery marker,
    // meaning the earlier email never went out. Recovery = resend, no dup coupon.
    mockedGetEventDiscounts.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      discounts: [{ triggerValue: existingCode } as any],
      ticketTypes: [],
    })

    await handleSpeakerTicket(makeEvent({}, [speaker]))

    expect(mockedCreateEventDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).toHaveBeenCalledWith(
      'proposal-1',
      speaker._id,
      existingCode,
    )
  })

  it('does not record a delivery marker and stays recoverable when the email fails after coupon creation', async () => {
    const speaker = makeSpeaker()
    mockedSendEmail.mockRejectedValue(new Error('resend down'))

    await expect(
      handleSpeakerTicket(makeEvent({}, [speaker])),
    ).resolves.toBeUndefined()

    // Coupon was created, but because the email failed we must NOT mark the
    // speaker as done — a re-trigger has to be able to resend.
    expect(mockedCreateEventDiscount).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).not.toHaveBeenCalled()
  })

  it('still succeeds (email delivered) even if recording the marker fails', async () => {
    const speaker = makeSpeaker()
    mockedRecordEmailed.mockRejectedValue(new Error('sanity write failed'))

    await expect(
      handleSpeakerTicket(makeEvent({}, [speaker])),
    ).resolves.toBeUndefined()

    expect(mockedCreateEventDiscount).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
  })

  it('no-ops (no lookups) when checkin is not configured', async () => {
    mockedIsConfigured.mockReturnValue(false)

    await handleSpeakerTicket(makeEvent())

    expect(mockedGetEventDiscounts).not.toHaveBeenCalled()
    expect(mockedCreateEventDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('no-ops when the conference has no checkinEventId', async () => {
    await handleSpeakerTicket(
      makeEvent({
        conference: createMockConference({ checkinEventId: undefined }),
      }),
    )

    expect(mockedGetEventDiscounts).not.toHaveBeenCalled()
    expect(mockedCreateEventDiscount).not.toHaveBeenCalled()
  })

  it('ignores non-confirm actions', async () => {
    await handleSpeakerTicket(makeEvent({ action: Action.accept }))

    expect(mockedGetEventDiscounts).not.toHaveBeenCalled()
    expect(mockedCreateEventDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('does not throw when issuing/emailing fails for a speaker', async () => {
    mockedCreateEventDiscount.mockRejectedValue(new Error('checkin down'))

    await expect(handleSpeakerTicket(makeEvent())).resolves.toBeUndefined()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('aborts without issuing when the existing-discount lookup fails', async () => {
    mockedGetEventDiscounts.mockRejectedValue(new Error('lookup failed'))

    await expect(handleSpeakerTicket(makeEvent())).resolves.toBeUndefined()
    expect(mockedCreateEventDiscount).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })
})
