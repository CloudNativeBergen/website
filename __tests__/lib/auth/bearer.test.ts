/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encode } from 'next-auth/jwt'
import { getSessionFromBearerToken } from '@/lib/auth'

const AUTH_SECRET = 'test-secret-long-enough-for-jwt-encryption'
const JWT_SALT = 'authjs.session-token'

function validPayload() {
  return {
    sub: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    picture: 'https://example.com/avatar.png',
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

async function mintToken(payload = validPayload(), maxAge = 30 * 24 * 60 * 60) {
  return encode({ token: payload, secret: AUTH_SECRET, salt: JWT_SALT, maxAge })
}

describe('getSessionFromBearerToken', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = AUTH_SECRET
  })

  afterEach(() => {
    delete process.env.AUTH_SECRET
  })

  it('should return a valid session from a valid token', async () => {
    const token = await mintToken()
    const session = await getSessionFromBearerToken(token)

    expect(session).not.toBeNull()
    expect(session!.user).toEqual({
      sub: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      picture: 'https://example.com/avatar.png',
    })
    expect(session!.speaker!._id).toBe('speaker-abc')
    expect(session!.account!.provider).toBe('github')
  })

  it('should preserve isOrganizer flag from token', async () => {
    const payload = validPayload()
    payload.speaker.isOrganizer = true
    const token = await mintToken(payload)
    const session = await getSessionFromBearerToken(token)

    expect(session!.speaker!.isOrganizer).toBe(true)
  })

  it('should set expires from token exp', async () => {
    const token = await mintToken()
    const session = await getSessionFromBearerToken(token)

    const expires = new Date(session!.expires)
    const expectedMin = Date.now() + 29 * 24 * 60 * 60 * 1000
    expect(expires.getTime()).toBeGreaterThan(expectedMin)
  })

  it('should return null for an expired token', async () => {
    const token = await mintToken(validPayload(), 1)
    // Advance time past the 1-second maxAge
    const realNow = Date.now
    Date.now = () => realNow() + 2000
    try {
      const session = await getSessionFromBearerToken(token)
      expect(session).toBeNull()
    } finally {
      Date.now = realNow
    }
  })

  it('should return null for a malformed token', async () => {
    const session = await getSessionFromBearerToken('not-a-valid-jwt')

    expect(session).toBeNull()
  })

  it('should return null for a token signed with wrong secret', async () => {
    const token = await encode({
      token: validPayload(),
      secret: 'wrong-secret-that-is-long-enough-for-encryption',
      salt: JWT_SALT,
      maxAge: 3600,
    })
    const session = await getSessionFromBearerToken(token)

    expect(session).toBeNull()
  })

  it('should return null when AUTH_SECRET is not set', async () => {
    delete process.env.AUTH_SECRET
    const token = await mintToken()
    const session = await getSessionFromBearerToken(token)

    expect(session).toBeNull()
  })

  it('should return null when token is missing speaker', async () => {
    const payload = { ...validPayload() } as Record<string, unknown>
    delete payload.speaker
    const token = await encode({
      token: payload,
      secret: AUTH_SECRET,
      salt: JWT_SALT,
      maxAge: 3600,
    })
    const session = await getSessionFromBearerToken(token)

    expect(session).toBeNull()
  })

  it('should return null when token is missing account', async () => {
    const payload = { ...validPayload() } as Record<string, unknown>
    delete payload.account
    const token = await encode({
      token: payload,
      secret: AUTH_SECRET,
      salt: JWT_SALT,
      maxAge: 3600,
    })
    const session = await getSessionFromBearerToken(token)

    expect(session).toBeNull()
  })

  it('should return null when token is missing sub', async () => {
    const payload = { ...validPayload() } as Record<string, unknown>
    delete payload.sub
    const token = await encode({
      token: payload,
      secret: AUTH_SECRET,
      salt: JWT_SALT,
      maxAge: 3600,
    })
    const session = await getSessionFromBearerToken(token)

    expect(session).toBeNull()
  })

  it('should not include impersonation fields', async () => {
    const token = await mintToken()
    const session = await getSessionFromBearerToken(token)

    expect(session!.isImpersonating).toBeUndefined()
    expect(session!.realAdmin).toBeUndefined()
  })
})
