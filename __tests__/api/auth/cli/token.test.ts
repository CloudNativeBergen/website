/**
 * @vitest-environment node
 */
import { NextResponse } from 'next/server'
import { decode } from 'next-auth/jwt'

const mockGetAuthSession = vi.fn()

vi.mock('@/lib/auth', () => ({
  getAuthSession: (...args: unknown[]) => mockGetAuthSession(...args),
}))

const JWT_SALT = 'authjs.session-token'

function validSession() {
  return {
    user: {
      sub: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      picture: 'https://example.com/avatar.png',
    },
    speaker: {
      _id: 'speaker-abc',
      name: 'Test User',
      email: 'test@example.com',
      image: 'image-ref',
      isOrganizer: false,
      flags: [],
    },
    account: {
      provider: 'github',
      providerAccountId: '12345',
      type: 'oauth',
    },
  }
}

describe('api/auth/cli/token', () => {
  const AUTH_SECRET = 'test-secret-long-enough-for-jwt-encryption'

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = AUTH_SECRET
  })

  afterEach(() => {
    delete process.env.AUTH_SECRET
  })

  describe('POST', () => {
    it('returns a token for an authenticated user', async () => {
      mockGetAuthSession.mockResolvedValue(validSession())
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body).toHaveProperty('token')
      expect(body).toHaveProperty('expiresAt')
      expect(typeof body.token).toBe('string')
      expect(body.token.length).toBeGreaterThan(0)
    })

    it('returns a token that decodes to the correct payload', async () => {
      const session = validSession()
      mockGetAuthSession.mockResolvedValue(session)
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      const body = await response.json()

      const decoded = await decode({
        token: body.token,
        secret: AUTH_SECRET,
        salt: JWT_SALT,
      })

      expect(decoded).toMatchObject({
        sub: session.user.sub,
        name: session.user.name,
        email: session.user.email,
        picture: session.user.picture,
        speaker: session.speaker,
        account: session.account,
      })
    })

    it('returns a token with 30-day expiry', async () => {
      mockGetAuthSession.mockResolvedValue(validSession())
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      const body = await response.json()

      const decoded = await decode({
        token: body.token,
        secret: AUTH_SECRET,
        salt: JWT_SALT,
      })

      const thirtyDays = 30 * 24 * 60 * 60
      expect(decoded!.exp! - decoded!.iat!).toBe(thirtyDays)
    })

    it('returns expiresAt as a valid ISO date roughly 30 days out', async () => {
      mockGetAuthSession.mockResolvedValue(validSession())
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      const body = await response.json()

      const expiresAt = new Date(body.expiresAt)
      const expectedMin = Date.now() + 29 * 24 * 60 * 60 * 1000
      const expectedMax = Date.now() + 31 * 24 * 60 * 60 * 1000
      expect(expiresAt.getTime()).toBeGreaterThan(expectedMin)
      expect(expiresAt.getTime()).toBeLessThan(expectedMax)
    })

    it('returns 401 when not authenticated', async () => {
      mockGetAuthSession.mockResolvedValue(null)
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      expect(response.status).toBe(401)

      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    it('returns 401 when session has no speaker', async () => {
      const session = validSession()
      delete (session as Record<string, unknown>).speaker
      mockGetAuthSession.mockResolvedValue(session)
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      expect(response.status).toBe(401)
    })

    it('returns 401 when session has no account', async () => {
      const session = validSession()
      delete (session as Record<string, unknown>).account
      mockGetAuthSession.mockResolvedValue(session)
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      expect(response.status).toBe(401)
    })

    it('returns 401 when session has no user', async () => {
      const session = validSession()
      delete (session as Record<string, unknown>).user
      mockGetAuthSession.mockResolvedValue(session)
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      expect(response.status).toBe(401)
    })

    it('returns 500 when AUTH_SECRET is not set', async () => {
      delete process.env.AUTH_SECRET
      mockGetAuthSession.mockResolvedValue(validSession())
      const { POST } = await import('@/app/api/auth/cli/token/route')

      const response = await POST()
      expect(response.status).toBe(500)

      const body = await response.json()
      expect(body.error).toBe('Server configuration error')
    })
  })
})
