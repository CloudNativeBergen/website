import { describe, it, expect, vi, beforeEach } from 'vitest'
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
} from '@/lib/push/sanity'
import { getVapidPublicKey } from '@/lib/push/vapid'
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
  }),
  setPushPreferences: vi.fn().mockImplementation(async (_id, prefs) => prefs),
}))
vi.mock('@/lib/push/vapid', () => ({
  getVapidPublicKey: vi.fn().mockReturnValue('test-public-key'),
}))

const mockAdd = vi.mocked(addPushSubscription)
const mockRemove = vi.mocked(removePushSubscription)
const mockSetPrefs = vi.mocked(setPushPreferences)

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
})
