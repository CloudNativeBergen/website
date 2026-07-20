import { describe, it, expect, vi, beforeEach } from 'vitest'

const getAuthSessionMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  getAuthSession: (...args: unknown[]) => getAuthSessionMock(...args),
}))

import { GET } from './route'

const LAUNCH_URL = 'https://cloudnativebergen.dev/launch'

function locationOf(response: Response): string {
  const location = response.headers.get('location')
  if (!location) throw new Error('expected a Location header')
  // Assert on the pathname so the test is host-agnostic.
  return new URL(location).pathname
}

describe('/launch — role-aware PWA start page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects an organizer to /admin', async () => {
    getAuthSessionMock.mockResolvedValue({
      speaker: { _id: 'spk-org', isOrganizer: true },
    })

    const response = await GET(new Request(LAUNCH_URL))

    expect(response.status).toBe(307)
    expect(locationOf(response)).toBe('/admin')
  })

  it('redirects a signed-in non-organizer speaker to /cfp/list', async () => {
    getAuthSessionMock.mockResolvedValue({
      speaker: { _id: 'spk-1', isOrganizer: false },
    })

    const response = await GET(new Request(LAUNCH_URL))

    expect(response.status).toBe(307)
    expect(locationOf(response)).toBe('/cfp/list')
  })

  it('redirects a logged-out visitor to the public /program (no login wall)', async () => {
    getAuthSessionMock.mockResolvedValue(null)

    const response = await GET(new Request(LAUNCH_URL))

    expect(response.status).toBe(307)
    expect(locationOf(response)).toBe('/program')
  })

  it('sends a session without a speaker to the public /program', async () => {
    // Defensive: a session object that somehow carries no speaker is treated
    // as an attendee, never as a speaker — no /cfp/list leak.
    getAuthSessionMock.mockResolvedValue({ user: { email: 'x@example.com' } })

    const response = await GET(new Request(LAUNCH_URL))

    expect(locationOf(response)).toBe('/program')
  })

  it('follows the impersonated (non-organizer) role → /cfp/list', async () => {
    // getAuthSession swaps session.speaker to the impersonated speaker (which is
    // always non-organizer) and sets isImpersonating. The dispatcher should then
    // land on the speaker home, previewing what the impersonated user sees.
    getAuthSessionMock.mockResolvedValue({
      speaker: { _id: 'spk-victim', isOrganizer: false },
      isImpersonating: true,
      realAdmin: { _id: 'spk-admin', isOrganizer: true },
    })

    const response = await GET(new Request(LAUNCH_URL))

    expect(locationOf(response)).toBe('/cfp/list')
  })

  it('marks the redirect no-store so it is never cached', async () => {
    getAuthSessionMock.mockResolvedValue(null)

    const response = await GET(new Request(LAUNCH_URL))

    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('passes the request url and headers through to getAuthSession', async () => {
    // So Bearer-token auth and dev ?impersonate= resolution keep working.
    getAuthSessionMock.mockResolvedValue(null)

    const request = new Request(`${LAUNCH_URL}?impersonate=abc`, {
      headers: { authorization: 'Bearer token-xyz' },
    })
    await GET(request)

    expect(getAuthSessionMock).toHaveBeenCalledTimes(1)
    const arg = getAuthSessionMock.mock.calls[0][0] as {
      url: string
      headers: Headers
    }
    expect(arg.url).toBe(`${LAUNCH_URL}?impersonate=abc`)
    expect(arg.headers.get('authorization')).toBe('Bearer token-xyz')
  })
})
