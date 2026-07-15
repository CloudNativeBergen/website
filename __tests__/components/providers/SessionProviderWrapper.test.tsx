import { describe, expect, it } from 'vitest'
import type { Session } from 'next-auth'
import { sanitizeSession } from '@/components/providers/SessionProviderWrapper'

describe('sanitizeSession', () => {
  it('returns undefined (not null) for a missing session, so SessionProvider refetches on mount', () => {
    expect(sanitizeSession(null)).toBeUndefined()
  })

  it('returns undefined when the session has no user', () => {
    expect(
      sanitizeSession({ expires: '2099-01-01' } as Session),
    ).toBeUndefined()
  })

  it('passes through user (name/email/picture only) and strips OAuth tokens from account', () => {
    const result = sanitizeSession({
      user: { name: 'Ada', email: 'ada@example.com', picture: 'p.png' },
      account: { provider: 'github', access_token: 'SECRET_TOKEN' },
      expires: '2099-01-01',
    } as unknown as Session)

    expect(result).toBeDefined()
    expect(result?.user).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      picture: 'p.png',
    })
    // account narrowed to just the provider name; tokens must not survive.
    expect(result?.account).toEqual({ provider: 'github' })
    expect(JSON.stringify(result)).not.toContain('SECRET_TOKEN')
  })

  it('leaves account undefined when the session has no account', () => {
    const result = sanitizeSession({
      user: { name: 'Ada', email: 'ada@example.com', picture: null },
      expires: '2099-01-01',
    } as unknown as Session)

    expect(result?.account).toBeUndefined()
  })
})
