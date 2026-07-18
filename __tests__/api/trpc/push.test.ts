import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createAuthenticatedCaller,
  createAnonymousCaller,
  speakers,
} from '../../helpers/trpc'
import {
  addPushSubscription,
  removePushSubscription,
  getPushPreferences,
  setPushPreferences,
  getSpeakerPushState,
  prunePushSubscription,
} from '@/lib/push/sanity'
import { getVapidPublicKey, isPushConfigured } from '@/lib/push/vapid'
import { sendPush } from '@/lib/push/send'
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/types'

vi.mock('@/lib/push/sanity', () => ({
  addPushSubscription: vi.fn().mockResolvedValue(undefined),
  removePushSubscription: vi.fn().mockResolvedValue(undefined),
  // Inline literal (not the imported constant) — vi.mock factories are hoisted
  // above imports, so they cannot reference module-level bindings.
  getPushPreferences: vi.fn().mockResolvedValue({
    proposalDecisions: true,
    talkConfirmed: true,
    coSpeakerInvites: true,
    messages: true,
    otherUpdates: true,
  }),
  setPushPreferences: vi.fn().mockImplementation(async (_id, prefs) => prefs),
  getSpeakerPushState: vi.fn().mockResolvedValue({
    subscriptions: [],
    preferences: {
      proposalDecisions: true,
      talkConfirmed: true,
      coSpeakerInvites: true,
      otherUpdates: true,
    },
  }),
  prunePushSubscription: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/push/vapid', () => ({
  getVapidPublicKey: vi.fn().mockReturnValue('test-public-key'),
  isPushConfigured: vi.fn().mockReturnValue(true),
}))
// Mock the transport so no real web-push/network is touched (this suite also
// avoids importing the server-only send module for real).
vi.mock('@/lib/push/send', () => ({
  sendPush: vi
    .fn()
    .mockResolvedValue({ ok: true, statusCode: 201, gone: false }),
}))

const mockAdd = vi.mocked(addPushSubscription)
const mockRemove = vi.mocked(removePushSubscription)
const mockSetPrefs = vi.mocked(setPushPreferences)
const mockGetState = vi.mocked(getSpeakerPushState)
const mockPrune = vi.mocked(prunePushSubscription)
const mockIsConfigured = vi.mocked(isPushConfigured)
const mockSendPush = vi.mocked(sendPush)

const SUBSCRIPTION_INPUT = {
  endpoint: 'https://push.example/endpoint-1',
  keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
}

const speakerA = speakers[0]._id
const speakerB = speakers[1]._id

describe('push router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getVapidKey returns the public key', async () => {
    const caller = createAuthenticatedCaller(speakerA)
    const result = await caller.push.getVapidKey()
    expect(result).toEqual({ publicKey: 'test-public-key' })
    expect(getVapidPublicKey).toHaveBeenCalled()
  })

  it('subscribe binds the write to the CALLER’s own speaker id', async () => {
    const caller = createAuthenticatedCaller(speakerA)
    await caller.push.subscribe(SUBSCRIPTION_INPUT)

    expect(mockAdd).toHaveBeenCalledTimes(1)
    const [speakerId, record] = mockAdd.mock.calls[0]
    expect(speakerId).toBe(speakerA)
    expect(record.endpoint).toBe(SUBSCRIPTION_INPUT.endpoint)
  })

  it('two different callers each write to their OWN speaker doc', async () => {
    await createAuthenticatedCaller(speakerA).push.subscribe(SUBSCRIPTION_INPUT)
    await createAuthenticatedCaller(speakerB).push.subscribe({
      ...SUBSCRIPTION_INPUT,
      endpoint: 'https://push.example/endpoint-2',
    })

    expect(mockAdd.mock.calls[0][0]).toBe(speakerA)
    expect(mockAdd.mock.calls[1][0]).toBe(speakerB)
    // Neither call could ever have targeted the other speaker.
    expect(mockAdd.mock.calls[0][0]).not.toBe(speakerB)
  })

  it('unsubscribe removes only from the caller’s own doc', async () => {
    const caller = createAuthenticatedCaller(speakerA)
    await caller.push.unsubscribe({ endpoint: SUBSCRIPTION_INPUT.endpoint })

    expect(mockRemove).toHaveBeenCalledWith(
      speakerA,
      SUBSCRIPTION_INPUT.endpoint,
    )
  })

  it('setPreferences binds to the caller’s own speaker id', async () => {
    const caller = createAuthenticatedCaller(speakerA)
    const prefs = {
      proposalDecisions: true,
      talkConfirmed: false,
      coSpeakerInvites: true,
      messages: true,
      otherUpdates: false,
    }
    await caller.push.setPreferences(prefs)

    expect(mockSetPrefs).toHaveBeenCalledWith(speakerA, prefs)
  })

  it('getPreferences reads the caller’s own preferences', async () => {
    const caller = createAuthenticatedCaller(speakerA)
    const result = await caller.push.getPreferences()
    expect(result).toEqual(DEFAULT_PUSH_PREFERENCES)
    expect(getPushPreferences).toHaveBeenCalledWith(speakerA)
  })

  it('rejects an unauthenticated caller (no cross-user writes possible)', async () => {
    const caller = createAnonymousCaller()
    await expect(caller.push.subscribe(SUBSCRIPTION_INPUT)).rejects.toThrow(
      /Authentication required|UNAUTHORIZED/,
    )
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('rejects a malformed subscription payload', async () => {
    const caller = createAuthenticatedCaller(speakerA)
    await expect(
      // @ts-expect-error — intentionally invalid input
      caller.push.subscribe({ endpoint: 'not-a-url', keys: {} }),
    ).rejects.toThrow()
    expect(mockAdd).not.toHaveBeenCalled()
  })

  describe('sendTest', () => {
    const SUB = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    // Monotonic fake clock: each test runs 60s after the previous, so the
    // module-scoped per-speaker cooldown from a prior test is always expired.
    // (Resetting to real `Date.now()` each test would NOT — the whole suite
    // runs within a few ms of wall-clock, well inside the 10s window.)
    let clock = Date.parse('2026-06-01T00:00:00.000Z')

    beforeEach(() => {
      vi.useFakeTimers()
      clock += 60_000
      vi.setSystemTime(clock)
      mockIsConfigured.mockReturnValue(true)
      mockGetState.mockResolvedValue({
        subscriptions: [SUB],
        preferences: DEFAULT_PUSH_PREFERENCES,
      })
      mockSendPush.mockResolvedValue({ ok: true, statusCode: 201, gone: false })
      mockPrune.mockResolvedValue(undefined)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('sends to every subscription and returns counts (happy path)', async () => {
      mockGetState.mockResolvedValue({
        subscriptions: [
          SUB,
          { ...SUB, endpoint: 'https://fcm.googleapis.com/fcm/send/device-2' },
        ],
        preferences: DEFAULT_PUSH_PREFERENCES,
      })
      const caller = createAuthenticatedCaller(speakerA)
      const result = await caller.push.sendTest()

      expect(result).toEqual({ sent: 2, gone: 0, total: 2, configured: true })
      expect(mockGetState).toHaveBeenCalledWith(speakerA)
      expect(mockSendPush).toHaveBeenCalledTimes(2)
      // Uses the production payload shape: deep link + collapse tag, bypassing
      // per-category preferences (explicit user action).
      const [, payload] = mockSendPush.mock.calls[0]
      expect(payload).toMatchObject({
        title: 'Test notification',
        url: '/cfp/profile',
        tag: 'test-notification',
      })
      expect(mockPrune).not.toHaveBeenCalled()
    })

    it('returns configured:false when push is not configured', async () => {
      mockIsConfigured.mockReturnValue(false)
      const caller = createAuthenticatedCaller(speakerA)
      const result = await caller.push.sendTest()

      expect(result).toEqual({ sent: 0, gone: 0, total: 0, configured: false })
      expect(mockGetState).not.toHaveBeenCalled()
      expect(mockSendPush).not.toHaveBeenCalled()
    })

    it('returns zero counts when the caller has no subscriptions', async () => {
      mockGetState.mockResolvedValue({
        subscriptions: [],
        preferences: DEFAULT_PUSH_PREFERENCES,
      })
      const caller = createAuthenticatedCaller(speakerA)
      const result = await caller.push.sendTest()

      expect(result).toEqual({ sent: 0, gone: 0, total: 0, configured: true })
      expect(mockSendPush).not.toHaveBeenCalled()
    })

    it('prunes a gone (404/410) subscription exactly like production', async () => {
      mockSendPush.mockResolvedValue({ ok: false, statusCode: 410, gone: true })
      const caller = createAuthenticatedCaller(speakerA)
      const result = await caller.push.sendTest()

      expect(result).toEqual({ sent: 0, gone: 1, total: 1, configured: true })
      expect(mockPrune).toHaveBeenCalledWith(speakerA, SUB.endpoint)
    })

    it('refuses a second test within the cooldown window', async () => {
      const caller = createAuthenticatedCaller(speakerA)
      await caller.push.sendTest()
      // No time advance → still inside the 10s per-speaker cooldown.
      await expect(caller.push.sendTest()).rejects.toThrow(
        /wait a few seconds|TOO_MANY_REQUESTS/,
      )
      // The refused call never reached the transport a second time.
      expect(mockSendPush).toHaveBeenCalledTimes(1)
    })

    it('rejects an unauthenticated caller', async () => {
      const caller = createAnonymousCaller()
      await expect(caller.push.sendTest()).rejects.toThrow(
        /Authentication required|UNAUTHORIZED/,
      )
      expect(mockSendPush).not.toHaveBeenCalled()
    })
  })
})
