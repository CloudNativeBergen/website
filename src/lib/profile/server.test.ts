import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from 'next-auth'

// --- Mocks -----------------------------------------------------------------

const githubVerifiedMock = vi.fn()
vi.mock('./github', () => ({
  verifiedEmails: (...args: unknown[]) => githubVerifiedMock(...args),
}))

const knownEmailsFetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (...args: unknown[]) => knownEmailsFetchMock(...args),
  },
}))

import { getVerifiedProfileEmails, isEmailVerifiedForSession } from './server'

// --- Helpers ---------------------------------------------------------------

function session(overrides: Partial<Session> = {}): Session {
  return {
    user: { email: 'primary@example.com' },
    account: { provider: 'github', providerAccountId: 'gh-1', type: 'oauth' },
    speaker: { _id: 'speaker-1' },
    ...overrides,
  } as unknown as Session
}

beforeEach(() => {
  vi.clearAllMocks()
  githubVerifiedMock.mockResolvedValue({ error: null, emails: [] })
  knownEmailsFetchMock.mockResolvedValue([])
})

describe('getVerifiedProfileEmails — provider-verified source of truth', () => {
  it('returns the GitHub API verified set', async () => {
    githubVerifiedMock.mockResolvedValue({
      error: null,
      emails: [
        { email: 'primary@example.com', verified: true, primary: true },
        { email: 'work@corp.com', verified: true, primary: false },
      ],
    })

    const emails = await getVerifiedProfileEmails(session())
    expect(emails.map((e) => e.email)).toEqual([
      'primary@example.com',
      'work@corp.com',
    ])
  })

  it('falls back to the session primary when the GitHub API errors', async () => {
    githubVerifiedMock.mockResolvedValue({
      error: new Error('boom'),
      emails: [],
    })

    const emails = await getVerifiedProfileEmails(session())
    expect(emails).toEqual([
      {
        email: 'primary@example.com',
        verified: true,
        primary: true,
        visibility: 'private',
      },
    ])
  })

  it('returns only the session primary for LinkedIn (default branch)', async () => {
    const emails = await getVerifiedProfileEmails(
      session({
        account: {
          provider: 'linkedin',
          providerAccountId: 'li-1',
          type: 'oidc',
        },
      } as Partial<Session>),
    )
    expect(emails.map((e) => e.email)).toEqual(['primary@example.com'])
    // GitHub API is never consulted for non-GitHub providers.
    expect(githubVerifiedMock).not.toHaveBeenCalled()
  })
})

describe('isEmailVerifiedForSession — C1 ownership guard', () => {
  it('accepts an email in the caller verified set (case-insensitive)', async () => {
    githubVerifiedMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'Work@Corp.com', verified: true }],
    })

    await expect(
      isEmailVerifiedForSession(session(), 'work@corp.com'),
    ).resolves.toBe(true)
  })

  it('rejects an email NOT owned by the caller (takeover attempt)', async () => {
    githubVerifiedMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'primary@example.com', verified: true }],
    })

    await expect(
      isEmailVerifiedForSession(session(), 'victim@example.com'),
    ).resolves.toBe(false)
  })

  it('rejects an empty email', async () => {
    await expect(isEmailVerifiedForSession(session(), '')).resolves.toBe(false)
  })

  it('accepts a GitHub email not yet in knownEmails via the live verified list', async () => {
    githubVerifiedMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'work@corp.com', verified: true }],
    })
    knownEmailsFetchMock.mockResolvedValue([]) // not yet persisted
    await expect(
      isEmailVerifiedForSession(session(), 'work@corp.com'),
    ).resolves.toBe(true)
  })

  it('LinkedIn: accepts an email only if it is in the persisted knownEmails set', async () => {
    const linkedin = session({
      account: {
        provider: 'linkedin',
        providerAccountId: 'li-1',
        type: 'oidc',
      },
    } as Partial<Session>)
    knownEmailsFetchMock.mockResolvedValue(['me@corp.com'])

    await expect(
      isEmailVerifiedForSession(linkedin, 'me@corp.com'),
    ).resolves.toBe(true)
    // The GitHub live-list path is never used for LinkedIn.
    expect(githubVerifiedMock).not.toHaveBeenCalled()
  })

  it('LinkedIn: rejects the session primary when it is NOT in knownEmails (F1 — no blanket trust)', async () => {
    const linkedin = session({
      user: { email: 'victim@corp.com' },
      account: {
        provider: 'linkedin',
        providerAccountId: 'li-1',
        type: 'oidc',
      },
    } as Partial<Session>)
    knownEmailsFetchMock.mockResolvedValue([]) // login never verified this address

    await expect(
      isEmailVerifiedForSession(linkedin, 'victim@corp.com'),
    ).resolves.toBe(false)
  })

  it('fails closed when the knownEmails read throws', async () => {
    const linkedin = session({
      account: {
        provider: 'linkedin',
        providerAccountId: 'li-1',
        type: 'oidc',
      },
    } as Partial<Session>)
    knownEmailsFetchMock.mockRejectedValue(new Error('sanity down'))
    await expect(
      isEmailVerifiedForSession(linkedin, 'me@corp.com'),
    ).resolves.toBe(false)
  })
})
