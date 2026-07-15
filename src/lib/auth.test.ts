import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JWT } from 'next-auth/jwt'
import type { Account } from 'next-auth'

// AUTH_SECRET must be present: the real auth-link crypto and the prior-session
// decode both require it.
process.env.AUTH_SECRET = 'auth-callback-test-secret'

// --- Mocks -----------------------------------------------------------------

// In-memory cookie jar shared with the module under test via next/headers.
type Jar = {
  store: Map<string, string>
  get: (name: string) => { value: string } | undefined
  set: (name: string, value: string) => void
  delete: ReturnType<typeof vi.fn>
}

function createJar(initial: Record<string, string> = {}): Jar {
  const store = new Map(Object.entries(initial))
  const del = vi.fn((name: string) => {
    store.delete(name)
  })
  return {
    store,
    get: (name: string) => {
      const value = store.get(name)
      return value === undefined ? undefined : { value }
    },
    set: (name: string, value: string) => {
      store.set(name, value)
    },
    delete: del,
  }
}

let currentJar: Jar = createJar()

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve(currentJar),
}))

// Control the pre-existing session decode.
const decodeMap = new Map<string, unknown>()
vi.mock('next-auth/jwt', () => ({
  decode: vi.fn(async ({ token }: { token: string }) =>
    decodeMap.has(token) ? decodeMap.get(token) : null,
  ),
}))

// Speaker resolution boundary.
const attachProviderToSpeaker = vi.fn()
const getOrCreateSpeaker = vi.fn()
const getSpeaker = vi.fn()
vi.mock('@/lib/speaker/sanity', () => ({
  attachProviderToSpeaker: (...args: unknown[]) =>
    attachProviderToSpeaker(...args),
  getOrCreateSpeaker: (...args: unknown[]) => getOrCreateSpeaker(...args),
  getSpeaker: (...args: unknown[]) => getSpeaker(...args),
}))

vi.mock('@/lib/sanity/client', () => ({
  speakerImageUrl: (src: string) => `img:${src}`,
}))

import { jwtSignInCallback, signOutHandler } from './auth'
import { signLinkIntent, LINK_INTENT_COOKIE } from './auth-link'

const SESSION_COOKIE = 'authjs.session-token'
const GITHUB: Account = {
  provider: 'github',
  providerAccountId: 'gh-999',
  type: 'oidc',
  access_token: 'tok',
}

function freshSignInToken(over: Partial<JWT> = {}): JWT {
  return {
    sub: 'new-random-sub',
    email: 'y@example.com',
    name: 'Y User',
    picture: undefined,
    ...over,
  } as JWT
}

/** A pre-existing session token for the given speaker + session id. */
function priorSession(speakerId: string, sub: string) {
  return {
    sub,
    speaker: { _id: speakerId, name: 'X', email: 'x@example.com' },
    account: { provider: 'github', providerAccountId: 'x-gh', type: 'oidc' },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  decodeMap.clear()
  currentJar = createJar()
})

describe('jwtSignInCallback — Phase 2 link consumption security', () => {
  it('links to the initiating speaker when the browser is still that speaker', async () => {
    // X is signed in (prior session = X) and started a github link.
    const intent = signLinkIntent({
      speakerId: 'spk-X',
      provider: 'github',
      initiatorSub: 'sess-X',
    })
    currentJar = createJar({
      [LINK_INTENT_COOKIE]: intent,
      [SESSION_COOKIE]: 'PRIOR_X',
    })
    decodeMap.set('PRIOR_X', priorSession('spk-X', 'sess-X'))
    attachProviderToSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-X', name: 'X', email: 'x@example.com' },
      status: 'linked',
      err: null,
    })

    const token = await jwtSignInCallback({
      token: freshSignInToken(),
      account: GITHUB,
      trigger: 'signIn',
    })

    expect(attachProviderToSpeaker).toHaveBeenCalledTimes(1)
    expect(attachProviderToSpeaker.mock.calls[0][0]).toBe('spk-X')
    expect(getOrCreateSpeaker).not.toHaveBeenCalled()
    expect((token as JWT & { speaker?: { _id: string } }).speaker?._id).toBe(
      'spk-X',
    )
    // Single-use: the intent cookie is deleted on consumption.
    expect(currentJar.delete).toHaveBeenCalledWith(LINK_INTENT_COOKIE)
  })

  it('is single-use: a second sign-in with the same jar does NOT attach again', async () => {
    const intent = signLinkIntent({
      speakerId: 'spk-X',
      provider: 'github',
      initiatorSub: 'sess-X',
    })
    currentJar = createJar({
      [LINK_INTENT_COOKIE]: intent,
      [SESSION_COOKIE]: 'PRIOR_X',
    })
    decodeMap.set('PRIOR_X', priorSession('spk-X', 'sess-X'))
    attachProviderToSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-X', name: 'X', email: 'x@example.com' },
      status: 'linked',
      err: null,
    })
    getOrCreateSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-Y', name: 'Y', email: 'y@example.com' },
      err: null,
    })

    // First sign-in consumes and deletes the intent.
    await jwtSignInCallback({
      token: freshSignInToken(),
      account: GITHUB,
      trigger: 'signIn',
    })
    expect(attachProviderToSpeaker).toHaveBeenCalledTimes(1)

    // Second sign-in on the SAME browser: cookie is gone → normal sign-in.
    const token2 = await jwtSignInCallback({
      token: freshSignInToken(),
      account: GITHUB,
      trigger: 'signIn',
    })
    expect(attachProviderToSpeaker).toHaveBeenCalledTimes(1) // not called again
    expect(getOrCreateSpeaker).toHaveBeenCalledTimes(1)
    expect((token2 as JWT & { speaker?: { _id: string } }).speaker?._id).toBe(
      'spk-Y',
    )
  })

  it('does NOT honour the intent when a DIFFERENT user completes the sign-in (the takeover)', async () => {
    // X abandoned a github link (intent lingers). Y signs in with github on the
    // same browser while the session still belongs to Y (different speaker).
    const intent = signLinkIntent({
      speakerId: 'spk-X',
      provider: 'github',
      initiatorSub: 'sess-X',
    })
    currentJar = createJar({
      [LINK_INTENT_COOKIE]: intent,
      [SESSION_COOKIE]: 'PRIOR_Y',
    })
    decodeMap.set('PRIOR_Y', priorSession('spk-Y', 'sess-Y'))
    getOrCreateSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-Y', name: 'Y', email: 'y@example.com' },
      err: null,
    })

    const token = await jwtSignInCallback({
      token: freshSignInToken(),
      account: GITHUB,
      trigger: 'signIn',
    })

    // The lingering intent is NOT consumed onto X.
    expect(attachProviderToSpeaker).not.toHaveBeenCalled()
    // Y gets their own normal session.
    expect(getOrCreateSpeaker).toHaveBeenCalledTimes(1)
    expect((token as JWT & { speaker?: { _id: string } }).speaker?._id).toBe(
      'spk-Y',
    )
    // The lingering intent is still cleared (single-use), so it cannot linger.
    expect(currentJar.delete).toHaveBeenCalledWith(LINK_INTENT_COOKIE)
  })

  it('does NOT honour the intent when there is NO active session', async () => {
    const intent = signLinkIntent({
      speakerId: 'spk-X',
      provider: 'github',
      initiatorSub: 'sess-X',
    })
    currentJar = createJar({ [LINK_INTENT_COOKIE]: intent }) // no session cookie
    getOrCreateSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-Z', name: 'Z', email: 'z@example.com' },
      err: null,
    })

    await jwtSignInCallback({
      token: freshSignInToken(),
      account: GITHUB,
      trigger: 'signIn',
    })

    expect(attachProviderToSpeaker).not.toHaveBeenCalled()
    expect(getOrCreateSpeaker).toHaveBeenCalledTimes(1)
    expect(currentJar.delete).toHaveBeenCalledWith(LINK_INTENT_COOKIE)
  })

  it('binds to the SPECIFIC initiating session: same speaker, different session sub is rejected', async () => {
    // Same speaker X but the browser session's `sub` no longer matches the one
    // captured at mint time — fail closed to a normal sign-in.
    const intent = signLinkIntent({
      speakerId: 'spk-X',
      provider: 'github',
      initiatorSub: 'sess-X',
    })
    currentJar = createJar({
      [LINK_INTENT_COOKIE]: intent,
      [SESSION_COOKIE]: 'PRIOR_X2',
    })
    decodeMap.set('PRIOR_X2', priorSession('spk-X', 'sess-OTHER'))
    getOrCreateSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-X', name: 'X', email: 'x@example.com' },
      err: null,
    })

    await jwtSignInCallback({
      token: freshSignInToken(),
      account: GITHUB,
      trigger: 'signIn',
    })

    expect(attachProviderToSpeaker).not.toHaveBeenCalled()
    expect(getOrCreateSpeaker).toHaveBeenCalledTimes(1)
  })

  it('does not attempt a link when there is no intent cookie at all', async () => {
    currentJar = createJar({ [SESSION_COOKIE]: 'PRIOR_X' })
    decodeMap.set('PRIOR_X', priorSession('spk-X', 'sess-X'))
    getOrCreateSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-X', name: 'X', email: 'x@example.com' },
      err: null,
    })

    await jwtSignInCallback({
      token: freshSignInToken(),
      account: GITHUB,
      trigger: 'signIn',
    })

    expect(attachProviderToSpeaker).not.toHaveBeenCalled()
    expect(getOrCreateSpeaker).toHaveBeenCalledTimes(1)
    expect(currentJar.delete).not.toHaveBeenCalled()
  })

  it('clears the intent even when the provider account is already linked elsewhere', async () => {
    const intent = signLinkIntent({
      speakerId: 'spk-X',
      provider: 'github',
      initiatorSub: 'sess-X',
    })
    currentJar = createJar({
      [LINK_INTENT_COOKIE]: intent,
      [SESSION_COOKIE]: 'PRIOR_X',
    })
    decodeMap.set('PRIOR_X', priorSession('spk-X', 'sess-X'))
    attachProviderToSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-Z' },
      status: 'already-linked-elsewhere',
      err: null,
    })
    getSpeaker.mockResolvedValue({
      speaker: { _id: 'spk-X', name: 'X', email: 'x@example.com' },
      err: null,
    })

    const token = await jwtSignInCallback({
      token: freshSignInToken(),
      account: GITHUB,
      trigger: 'signIn',
    })

    // Not merged: the session stays X, and the intent is single-use deleted.
    expect((token as JWT & { speaker?: { _id: string } }).speaker?._id).toBe(
      'spk-X',
    )
    expect(currentJar.delete).toHaveBeenCalledWith(LINK_INTENT_COOKIE)
  })
})

describe('signOutHandler — clears link-flow state', () => {
  it('deletes the link-intent cookie on sign-out', async () => {
    currentJar = createJar({ [LINK_INTENT_COOKIE]: 'anything' })

    await signOutHandler()

    expect(currentJar.delete).toHaveBeenCalledWith(LINK_INTENT_COOKIE)
  })
})
