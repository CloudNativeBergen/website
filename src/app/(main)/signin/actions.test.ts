/**
 * The sign-in actions hand back a path instead of calling `redirect()`: a
 * fetch-action `redirect()` makes Next fetch the target from its own origin,
 * which hung for 300 s on Vercel. These pin that no branch throws a redirect.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  signIn: vi.fn(),
  request: vi.fn(),
  set: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => (h.cookie ? { value: h.cookie } : undefined),
    set: h.set,
    delete: vi.fn(),
  }),
}))
vi.mock('@/lib/auth', () => ({ signIn: h.signIn }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({ conference: null }),
}))
vi.mock('@/lib/auth/email-link/request', () => ({
  requestEmailSignInLink: h.request,
}))
vi.mock('@/lib/auth/email-link/send', () => ({ sendEmailSignInLink: vi.fn() }))
vi.mock('./confirm/pending', () => ({
  readPendingEmailSignIn: (v?: string) =>
    v ? { token: 't', callbackUrl: '/cfp/list' } : null,
}))

import {
  confirmEmailSignInAction,
  requestEmailSignInLinkAction,
} from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  h.cookie = undefined
})

describe('requestEmailSignInLinkAction', () => {
  it('returns the check-your-email path and sets the intent cookie', async () => {
    h.request.mockResolvedValue({ intent: 'abc' })
    const fd = new FormData()
    fd.set('email', 'a@example.com')
    await expect(requestEmailSignInLinkAction(fd)).resolves.toBe(
      '/signin/verify-request',
    )
    expect(h.set).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'abc' }),
    )
  })

  it('returns the same path when the request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.request.mockRejectedValue(new Error('boom'))
    await expect(requestEmailSignInLinkAction(new FormData())).resolves.toBe(
      '/signin/verify-request',
    )
  })
})

describe('confirmEmailSignInAction', () => {
  it('returns the error path without a pending cookie', async () => {
    await expect(confirmEmailSignInAction()).resolves.toBe(
      '/signin?error=EmailSignIn',
    )
  })

  it('returns the same-origin path of the sign-in destination', async () => {
    h.cookie = 'x'
    h.signIn.mockResolvedValue('https://evil.example/cfp/list?x=1')
    await expect(confirmEmailSignInAction()).resolves.toBe('/cfp/list?x=1')
  })

  it('returns the error path when sign-in throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.cookie = 'x'
    h.signIn.mockRejectedValue(new Error('boom'))
    await expect(confirmEmailSignInAction()).resolves.toBe(
      '/signin?error=EmailSignIn',
    )
  })
})
