import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleEmailNotification } from '@/lib/events/handlers/emailNotification'
import type { ProposalStatusChangeEvent } from '@/lib/events/types'
import type { Speaker } from '@/lib/speaker/types'
import { Action, Status } from '@/lib/proposal/types'
import { sendAcceptRejectNotification } from '@/lib/proposal/server'

vi.mock('@/lib/proposal/server', () => ({
  sendAcceptRejectNotification: vi.fn().mockResolvedValue({ id: 'email-id' }),
}))

const mockSend = vi.mocked(sendAcceptRejectNotification)

function createSpeaker(overrides: Partial<Speaker> = {}): Speaker {
  return {
    _id: 'speaker-1',
    name: 'Primary Speaker',
    email: 'primary@example.com',
    ...overrides,
  } as Speaker
}

function createEvent(
  speakers: Speaker[],
  overrides: Partial<ProposalStatusChangeEvent> = {},
): ProposalStatusChangeEvent {
  return {
    eventType: 'proposal.status.changed',
    timestamp: new Date('2026-01-01T12:00:00Z'),
    proposal: {
      _id: 'proposal-1',
      title: 'Test Proposal',
    },
    previousStatus: Status.submitted,
    newStatus: Status.accepted,
    action: Action.accept,
    conference: {
      title: 'Cloud Native Day',
      city: 'Bergen',
      startDate: '2026-10-01',
      organizer: 'CNDN',
      contactEmail: 'contact@example.com',
      socialLinks: [],
    },
    speakers,
    metadata: {
      triggeredBy: { speakerId: 'organizer-1', isOrganizer: true },
      shouldNotify: true,
      comment: '',
      domain: 'example.com',
    },
    ...overrides,
  } as unknown as ProposalStatusChangeEvent
}

describe('handleEmailNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ id: 'email-id' } as never)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not send when shouldNotify is false', async () => {
    const event = createEvent([createSpeaker()])
    event.metadata.shouldNotify = false

    await handleEmailNotification(event)

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('does not send for non-notifiable actions', async () => {
    const event = createEvent([createSpeaker()], { action: Action.submit })

    await handleEmailNotification(event)

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('warns and returns when there are no speakers', async () => {
    const event = createEvent([])

    await handleEmailNotification(event)

    expect(mockSend).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      'No speakers found for email notification',
    )
  })

  it('sends a personalized email to every speaker on the proposal', async () => {
    const speakers = [
      createSpeaker(),
      createSpeaker({
        _id: 'speaker-2',
        name: 'Co Speaker',
        email: 'co@example.com',
      }),
      createSpeaker({
        _id: 'speaker-3',
        name: 'Third Speaker',
        email: 'third@example.com',
      }),
    ]

    await handleEmailNotification(createEvent(speakers))

    expect(mockSend).toHaveBeenCalledTimes(3)

    const recipients = mockSend.mock.calls.map((call) => call[0].speaker)
    expect(recipients).toEqual([
      { name: 'Primary Speaker', email: 'primary@example.com' },
      { name: 'Co Speaker', email: 'co@example.com' },
      { name: 'Third Speaker', email: 'third@example.com' },
    ])

    // All sends share the same action and proposal
    for (const call of mockSend.mock.calls) {
      expect(call[0].action).toBe(Action.accept)
      expect(call[0].proposal).toEqual({
        _id: 'proposal-1',
        title: 'Test Proposal',
      })
    }
  })

  it('de-duplicates recipients by email address (case-insensitive)', async () => {
    const speakers = [
      createSpeaker(),
      createSpeaker({ _id: 'speaker-dup', email: 'PRIMARY@Example.com' }),
      createSpeaker({
        _id: 'speaker-2',
        name: 'Co Speaker',
        email: 'co@example.com',
      }),
    ]

    await handleEmailNotification(createEvent(speakers))

    expect(mockSend).toHaveBeenCalledTimes(2)
    const emails = mockSend.mock.calls.map((call) => call[0].speaker.email)
    expect(emails).toEqual(['primary@example.com', 'co@example.com'])
  })

  it('skips speakers without an email address', async () => {
    const speakers = [
      createSpeaker({ email: '' }),
      createSpeaker({
        _id: 'speaker-2',
        name: 'Co Speaker',
        email: 'co@example.com',
      }),
    ]

    await handleEmailNotification(createEvent(speakers))

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend.mock.calls[0][0].speaker.email).toBe('co@example.com')
  })

  it('warns and returns when no speaker has an email address', async () => {
    const speakers = [
      createSpeaker({ email: '' }),
      createSpeaker({ _id: 'speaker-2', email: undefined as unknown as string }),
    ]

    await handleEmailNotification(createEvent(speakers))

    expect(mockSend).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      'No speakers with email addresses found for proposal proposal-1',
    )
  })

  it('continues sending to remaining speakers when one send fails', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('Failed to send email: boom'))
      .mockResolvedValue({ id: 'email-id' } as never)

    const speakers = [
      createSpeaker(),
      createSpeaker({
        _id: 'speaker-2',
        name: 'Co Speaker',
        email: 'co@example.com',
      }),
      createSpeaker({
        _id: 'speaker-3',
        name: 'Third Speaker',
        email: 'third@example.com',
      }),
    ]

    await expect(
      handleEmailNotification(createEvent(speakers)),
    ).resolves.toBeUndefined()

    expect(mockSend).toHaveBeenCalledTimes(3)
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to send email notification to 1 of 3 speaker(s) for proposal proposal-1:',
      [
        {
          email: 'primary@example.com',
          reason: 'Failed to send email: boom',
        },
      ],
    )
    expect(console.log).toHaveBeenCalledWith(
      'Email notification sent to 2 of 3 speaker(s) for proposal proposal-1',
    )
  })

  it('does not throw when all sends fail', async () => {
    mockSend.mockRejectedValue(new Error('resend down'))

    const speakers = [
      createSpeaker(),
      createSpeaker({
        _id: 'speaker-2',
        name: 'Co Speaker',
        email: 'co@example.com',
      }),
    ]

    await expect(
      handleEmailNotification(createEvent(speakers)),
    ).resolves.toBeUndefined()

    expect(console.warn).toHaveBeenCalledWith(
      'Failed to send email notification to 2 of 2 speaker(s) for proposal proposal-1:',
      [
        { email: 'primary@example.com', reason: 'resend down' },
        { email: 'co@example.com', reason: 'resend down' },
      ],
    )
  })
})
