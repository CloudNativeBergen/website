import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  handlePushNotification,
  handleCoSpeakerInvitePush,
} from '@/lib/events/handlers/pushNotification'
import type {
  ProposalStatusChangeEvent,
  CoSpeakerInvitedEvent,
} from '@/lib/events/types'
import type { Speaker } from '@/lib/speaker/types'
import { Action, Status } from '@/lib/proposal/types'
import { getSpeakerPushState, prunePushSubscription } from '@/lib/push/sanity'
import { sendPush } from '@/lib/push/send'
import { getSpeakerByEmail } from '@/lib/speaker/sanity'
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/types'

vi.mock('@/lib/push/sanity', () => ({
  getSpeakerPushState: vi.fn(),
  prunePushSubscription: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/push/send', () => ({
  sendPush: vi.fn(),
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakerByEmail: vi.fn(),
}))

const mockGetState = vi.mocked(getSpeakerPushState)
const mockPrune = vi.mocked(prunePushSubscription)
const mockSend = vi.mocked(sendPush)
const mockGetByEmail = vi.mocked(getSpeakerByEmail)

const SUBSCRIPTION = {
  endpoint: 'https://push.example/abc',
  keys: { p256dh: 'p', auth: 'a' },
  createdAt: '2026-01-01T00:00:00.000Z',
}

function speaker(id: string, overrides: Partial<Speaker> = {}): Speaker {
  return {
    _id: id,
    name: `Speaker ${id}`,
    email: `${id}@example.com`,
    ...overrides,
  } as Speaker
}

function statusEvent(
  overrides: Partial<ProposalStatusChangeEvent> = {},
): ProposalStatusChangeEvent {
  return {
    eventType: 'proposal.status.changed',
    timestamp: new Date('2026-01-01T12:00:00Z'),
    proposal: { _id: 'proposal-1', title: 'My Talk' },
    previousStatus: Status.submitted,
    newStatus: Status.accepted,
    action: Action.accept,
    conference: { title: 'Cloud Native Day' },
    speakers: [speaker('speaker-1')],
    metadata: {
      triggeredBy: { speakerId: 'organizer-1', isOrganizer: true },
      shouldNotify: true,
      domain: 'example.com',
    },
    ...overrides,
  } as unknown as ProposalStatusChangeEvent
}

describe('handlePushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetState.mockResolvedValue({
      subscriptions: [SUBSCRIPTION],
      preferences: { ...DEFAULT_PUSH_PREFERENCES },
    })
    mockSend.mockResolvedValue({ ok: true, statusCode: 201, gone: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends to a subscribed speaker when the category is on', async () => {
    await handlePushNotification(statusEvent())

    expect(mockGetState).toHaveBeenCalledWith('speaker-1')
    expect(mockSend).toHaveBeenCalledTimes(1)
    const [sub, payload] = mockSend.mock.calls[0]
    expect(sub.endpoint).toBe(SUBSCRIPTION.endpoint)
    expect(payload.url).toBe('/cfp/proposal/proposal-1')
    expect(mockPrune).not.toHaveBeenCalled()
  })

  it('does not send when the speaker has no subscriptions', async () => {
    mockGetState.mockResolvedValue({
      subscriptions: [],
      preferences: { ...DEFAULT_PUSH_PREFERENCES },
    })

    await handlePushNotification(statusEvent())

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('does not send when the category is turned off', async () => {
    mockGetState.mockResolvedValue({
      subscriptions: [SUBSCRIPTION],
      preferences: { ...DEFAULT_PUSH_PREFERENCES, proposalDecisions: false },
    })

    await handlePushNotification(statusEvent())

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('prunes a subscription reported gone (404/410)', async () => {
    mockSend.mockResolvedValue({ ok: false, statusCode: 410, gone: true })

    await handlePushNotification(statusEvent())

    expect(mockPrune).toHaveBeenCalledWith('speaker-1', SUBSCRIPTION.endpoint)
  })

  it('does not push a decision when shouldNotify is false', async () => {
    await handlePushNotification(
      statusEvent({
        metadata: {
          triggeredBy: { speakerId: 'o', isOrganizer: true },
          shouldNotify: false,
          domain: 'example.com',
        } as ProposalStatusChangeEvent['metadata'],
      }),
    )

    expect(mockGetState).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('pushes a confirm even without shouldNotify', async () => {
    await handlePushNotification(
      statusEvent({
        action: Action.confirm,
        newStatus: Status.confirmed,
        metadata: {
          triggeredBy: { speakerId: 'speaker-1', isOrganizer: false },
          domain: 'example.com',
        } as ProposalStatusChangeEvent['metadata'],
      }),
    )

    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('ignores non-push actions', async () => {
    await handlePushNotification(statusEvent({ action: Action.submit }))
    expect(mockGetState).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('only targets the speakers on the event (no cross-user push)', async () => {
    await handlePushNotification(
      statusEvent({ speakers: [speaker('speaker-A')] }),
    )

    // The push state is only ever read for the event's own speaker id — never
    // some other speaker's document.
    expect(mockGetState).toHaveBeenCalledTimes(1)
    expect(mockGetState).toHaveBeenCalledWith('speaker-A')
    expect(mockGetState).not.toHaveBeenCalledWith('speaker-1')
  })

  it('de-duplicates a speaker listed twice', async () => {
    await handlePushNotification(
      statusEvent({ speakers: [speaker('dup'), speaker('dup')] }),
    )
    expect(mockGetState).toHaveBeenCalledTimes(1)
  })
})

describe('handleCoSpeakerInvitePush', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetState.mockResolvedValue({
      subscriptions: [SUBSCRIPTION],
      preferences: { ...DEFAULT_PUSH_PREFERENCES },
    })
    mockSend.mockResolvedValue({ ok: true, statusCode: 201, gone: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function invite(
    overrides: Partial<CoSpeakerInvitedEvent> = {},
  ): CoSpeakerInvitedEvent {
    return {
      eventType: 'cospeaker.invited',
      timestamp: new Date(),
      invitedEmail: 'invitee@example.com',
      invitedName: 'Invitee',
      proposal: { _id: 'proposal-9', title: 'Shared Talk' },
      invitedBy: { name: 'Ada', email: 'ada@example.com' },
      conference: { title: 'Cloud Native Day' },
      metadata: { domain: 'example.com' },
      ...overrides,
    } as unknown as CoSpeakerInvitedEvent
  }

  it('pushes to an invitee who has an account + subscription', async () => {
    mockGetByEmail.mockResolvedValue({
      speaker: speaker('invitee-1'),
      err: null,
    })

    await handleCoSpeakerInvitePush(invite())

    expect(mockGetState).toHaveBeenCalledWith('invitee-1')
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend.mock.calls[0][1].body).toContain('Ada')
  })

  it('does nothing when the invitee has no account', async () => {
    mockGetByEmail.mockResolvedValue({ speaker: null, err: null })

    await handleCoSpeakerInvitePush(invite())

    expect(mockGetState).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('does not push when the invitee turned coSpeakerInvites off', async () => {
    mockGetByEmail.mockResolvedValue({
      speaker: speaker('invitee-1'),
      err: null,
    })
    mockGetState.mockResolvedValue({
      subscriptions: [SUBSCRIPTION],
      preferences: { ...DEFAULT_PUSH_PREFERENCES, coSpeakerInvites: false },
    })

    await handleCoSpeakerInvitePush(invite())

    expect(mockSend).not.toHaveBeenCalled()
  })
})
