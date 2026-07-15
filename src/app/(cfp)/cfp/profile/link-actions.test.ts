import { describe, it, expect, vi, beforeEach } from 'vitest'

const authMock = vi.fn()
const signInMock = vi.fn().mockResolvedValue(undefined)
const cookieSetMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => authMock(...args),
  signIn: (...args: unknown[]) => signInMock(...args),
}))

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ set: cookieSetMock }),
}))

// Real crypto-backed helpers; AUTH_SECRET must be present for minting.
process.env.AUTH_SECRET = 'link-actions-test-secret'

import { startProviderLink } from './link-actions'
import { LINK_INTENT_COOKIE, verifyLinkIntent } from '@/lib/auth-link'

function form(provider: string): FormData {
  const fd = new FormData()
  fd.set('provider', provider)
  return fd
}

describe('startProviderLink — self-service link (security gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signInMock.mockResolvedValue(undefined)
  })

  it('requires an authenticated session: no link cookie is minted when signed out', async () => {
    authMock.mockResolvedValue(null)

    await startProviderLink(form('github'))

    // No link-intent token may be issued for an unauthenticated caller.
    expect(cookieSetMock).not.toHaveBeenCalled()
    // They are still sent through a normal (non-link) sign-in.
    expect(signInMock).toHaveBeenCalledWith('github', {
      redirectTo: '/cfp/profile',
    })
  })

  it('mints an httpOnly link cookie bound to the signed-in speaker + session', async () => {
    authMock.mockResolvedValue({
      speaker: { _id: 'spk-x' },
      user: { sub: 'sess-x' },
    })

    await startProviderLink(form('linkedin'))

    expect(cookieSetMock).toHaveBeenCalledTimes(1)
    const [name, token, options] = cookieSetMock.mock.calls[0]
    expect(name).toBe(LINK_INTENT_COOKIE)
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax' })

    // The token binds THIS speaker + provider + initiating session and verifies
    // authentically.
    expect(verifyLinkIntent(token as string, 'linkedin')).toEqual({
      speakerId: 'spk-x',
      provider: 'linkedin',
      initiatorSub: 'sess-x',
    })
    // A different provider must not accept the same cookie.
    expect(verifyLinkIntent(token as string, 'github')).toBeNull()

    expect(signInMock).toHaveBeenCalledWith('linkedin', {
      redirectTo: '/cfp/profile',
    })
  })

  it('does not mint a link cookie when the session lacks a stable id', async () => {
    // Without an initiating session `sub` we cannot bind the intent, so we must
    // NOT mint one; fall back to a normal sign-in instead.
    authMock.mockResolvedValue({ speaker: { _id: 'spk-x' } })

    await startProviderLink(form('github'))

    expect(cookieSetMock).not.toHaveBeenCalled()
    expect(signInMock).toHaveBeenCalledWith('github', {
      redirectTo: '/cfp/profile',
    })
  })

  it('rejects an unsupported provider', async () => {
    authMock.mockResolvedValue({ speaker: { _id: 'spk-x' } })

    await expect(startProviderLink(form('google'))).rejects.toThrow(
      /Unsupported provider/,
    )
    expect(cookieSetMock).not.toHaveBeenCalled()
    expect(signInMock).not.toHaveBeenCalled()
  })
})
