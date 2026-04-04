/**
 * @vitest-environment node
 */
import { decode } from 'next-auth/jwt'
import { TRPCError } from '@trpc/server'
import {
  createAuthenticatedCaller,
  createAnonymousCaller,
} from '../../helpers/trpc'

const JWT_SALT = 'authjs.session-token'

describe('speaker.generateCliToken', () => {
  const AUTH_SECRET = 'test-secret-long-enough-for-jwt-encryption'

  beforeEach(() => {
    process.env.AUTH_SECRET = AUTH_SECRET
  })

  afterEach(() => {
    delete process.env.AUTH_SECRET
  })

  it('returns a token and expiresAt for an authenticated user', async () => {
    const caller = createAuthenticatedCaller()
    const result = await caller.speaker.generateCliToken()

    expect(result).toHaveProperty('token')
    expect(result).toHaveProperty('expiresAt')
    expect(typeof result.token).toBe('string')
    expect(result.token.length).toBeGreaterThan(0)
  })

  it('returns a token that decodes to the correct payload', async () => {
    const caller = createAuthenticatedCaller()
    const result = await caller.speaker.generateCliToken()

    const decoded = await decode({
      token: result.token,
      secret: AUTH_SECRET,
      salt: JWT_SALT,
    })

    expect(decoded).toMatchObject({
      speaker: expect.objectContaining({ _id: expect.any(String) }),
    })
  })

  it('returns a token with 30-day expiry', async () => {
    const caller = createAuthenticatedCaller()
    const result = await caller.speaker.generateCliToken()

    const decoded = await decode({
      token: result.token,
      secret: AUTH_SECRET,
      salt: JWT_SALT,
    })

    const thirtyDays = 30 * 24 * 60 * 60
    expect(decoded!.exp! - decoded!.iat!).toBe(thirtyDays)
  })

  it('returns expiresAt as a valid ISO date roughly 30 days out', async () => {
    const caller = createAuthenticatedCaller()
    const result = await caller.speaker.generateCliToken()

    const expiresAt = new Date(result.expiresAt)
    const expectedMin = Date.now() + 29 * 24 * 60 * 60 * 1000
    const expectedMax = Date.now() + 31 * 24 * 60 * 60 * 1000
    expect(expiresAt.getTime()).toBeGreaterThan(expectedMin)
    expect(expiresAt.getTime()).toBeLessThan(expectedMax)
  })

  it('throws UNAUTHORIZED when not authenticated', async () => {
    const caller = createAnonymousCaller()
    await expect(caller.speaker.generateCliToken()).rejects.toThrow(TRPCError)
    await expect(caller.speaker.generateCliToken()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('throws INTERNAL_SERVER_ERROR when AUTH_SECRET is not set', async () => {
    delete process.env.AUTH_SECRET
    const caller = createAuthenticatedCaller()
    await expect(caller.speaker.generateCliToken()).rejects.toThrow(TRPCError)
    await expect(caller.speaker.generateCliToken()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })
})
