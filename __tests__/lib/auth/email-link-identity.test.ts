/**
 * @vitest-environment node
 *
 * Identity behaviour of email sign-in:
 *  - the TIER decision (which token an address gets), and
 *  - how a redeemed link MATCHES AN EXISTING ACCOUNT rather than minting a
 *    duplicate (#267), plus the jwt-callback branch that projects it.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { mockFetch, mockCreate, mockPatch, mockSet, mockCommit, mockOrgRef } =
  vi.hoisted(() => {
    const mockCommit = vi.fn().mockResolvedValue({})
    const mockSet = vi.fn().mockReturnValue({ commit: mockCommit })
    const mockPatch = vi.fn().mockReturnValue({ set: mockSet })
    return {
      mockFetch: vi.fn(),
      mockCreate: vi.fn(),
      mockPatch,
      mockSet,
      mockCommit,
      mockOrgRef: vi.fn(),
    }
  })

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: mockFetch },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: { create: mockCreate, patch: mockPatch },
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: mockOrgRef,
}))

vi.mock('uuid', () => ({ v4: () => 'new-speaker-id' }))

import { resolveEmailLinkTier } from '@/lib/auth/email-link/tier'
import { getOrCreateSpeakerForVerifiedEmail } from '@/lib/speaker/sanity'
// The OAuth arm of the jwt callback reads the link-intent cookie, which needs a
// request scope this suite does not have. Mocked to an EMPTY jar so that arm
// runs its ordinary "no link intent" path — the arm itself is covered by
// `auth-link.test.ts`; what matters here is only that it never stamps the
// redeemed-address claim.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, delete: () => {} }),
}))

import { jwtSignInCallback, sessionCallback } from '@/lib/auth'
import {
  EMAIL_LINK_IDENTIFIER_CLAIM,
  emailLinkIdentifierOf,
} from '@/lib/auth/email-link/identity'
import type { Session } from 'next-auth'
import { EMAIL_LINK_PROVIDER_ID } from '@/lib/auth/email-link/constants'
import type { Account } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

describe('tier decision', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gives an ORGANIZER the stored (single-use, revocable) tier', async () => {
    mockFetch.mockResolvedValueOnce(true)
    expect(await resolveEmailLinkTier('organizer@example.com')).toBe('stored')
  })

  it('gives a plain speaker or an unknown address the stateless tier', async () => {
    mockFetch.mockResolvedValueOnce(false)
    expect(await resolveEmailLinkTier('speaker@example.com')).toBe('stateless')
  })

  it('FAILS SAFE to the stored tier when the lookup errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('sanity down'))
    expect(await resolveEmailLinkTier('someone@example.com')).toBe('stored')
  })

  it('matches on the verified match-set, not just the display email', async () => {
    mockFetch.mockResolvedValueOnce(true)
    await resolveEmailLinkTier('secondary@example.com')
    const [query, params] = mockFetch.mock.calls[0]
    expect(query).toContain('knownEmails')
    expect(params).toEqual({ email: 'secondary@example.com' })
  })
})

describe('matching a redeemed link to an existing account (#267)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrgRef.mockResolvedValue('org-1')
  })

  it('reuses the speaker whose VERIFIED email set contains the address', async () => {
    // 1. no prior email-link account, 2. exactly one verified-email match
    mockFetch.mockResolvedValueOnce(null).mockResolvedValueOnce([
      {
        _id: 'existing-speaker',
        name: 'Existing Speaker',
        email: 'speaker@example.com',
        slug: 'existing-speaker',
        knownEmails: ['speaker@example.com'],
        providers: ['github:42'],
        organizations: ['org-1'],
      },
    ])

    const { speaker, err } = await getOrCreateSpeakerForVerifiedEmail(
      'Speaker@Example.com',
    )

    expect(err).toBeNull()
    expect(speaker._id).toBe('existing-speaker')
    // No NEW document — the whole point.
    expect(mockCreate).not.toHaveBeenCalled()
    // The GitHub account it already had is preserved, and the email-link
    // account is added alongside it.
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [
          'github:42',
          `${EMAIL_LINK_PROVIDER_ID}:speaker@example.com`,
        ],
      }),
    )
  })

  it('short-circuits on a prior email-link account', async () => {
    mockFetch.mockResolvedValueOnce({
      _id: 'existing-speaker',
      name: 'Existing Speaker',
      email: 'speaker@example.com',
      slug: 'existing-speaker',
    })
    const { speaker } = await getOrCreateSpeakerForVerifiedEmail(
      'speaker@example.com',
    )
    expect(speaker._id).toBe('existing-speaker')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('creates a new speaker for an unknown address, seeding the VERIFIED match-set', async () => {
    mockFetch
      .mockResolvedValueOnce(null) // no provider match
      .mockResolvedValueOnce([]) // no email match
      .mockResolvedValueOnce(null) // slug availability probe
    mockCreate.mockImplementation(async (doc) => doc)

    const { speaker, err } = await getOrCreateSpeakerForVerifiedEmail(
      'jane.doe+cfp@example.com',
    )

    expect(err).toBeNull()
    expect(speaker._id).toBe('new-speaker-id')
    const doc = mockCreate.mock.calls[0][0]
    // Delivery IS verification, so the address legitimately joins knownEmails.
    expect(doc.knownEmails).toEqual(['jane.doe+cfp@example.com'])
    expect(doc.providers).toEqual([
      `${EMAIL_LINK_PROVIDER_ID}:jane.doe+cfp@example.com`,
    ])
    // A usable placeholder name, derived from the local part.
    expect(doc.name).toBe('Jane Doe')
  })

  it('prefers the current-org member when the global match is ambiguous', async () => {
    mockFetch.mockResolvedValueOnce(null).mockResolvedValueOnce([
      { _id: 'other-org-speaker', name: 'A', organizations: ['org-2'] },
      { _id: 'this-org-speaker', name: 'B', organizations: ['org-1'] },
    ])

    const { speaker } =
      await getOrCreateSpeakerForVerifiedEmail('shared@example.com')
    expect(speaker._id).toBe('this-org-speaker')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('never guesses when the ambiguity does not resolve — creates a fresh account', async () => {
    mockFetch
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([
        { _id: 'dup-a', name: 'A', organizations: ['org-2'] },
        { _id: 'dup-b', name: 'B', organizations: ['org-3'] },
      ])
      .mockResolvedValueOnce(null)
    mockCreate.mockImplementation(async (doc) => doc)

    const { speaker } =
      await getOrCreateSpeakerForVerifiedEmail('shared@example.com')
    // Adopting the oldest would be attacker-influenceable; refusing outright
    // would strand the user. A fresh document takes over neither account.
    expect(speaker._id).toBe('new-speaker-id')
    expect(['dup-a', 'dup-b']).not.toContain(speaker._id)
  })

  it('propagates a read failure instead of silently creating a duplicate', async () => {
    mockFetch.mockRejectedValueOnce(new Error('sanity down'))
    const { err } = await getOrCreateSpeakerForVerifiedEmail('x@example.com')
    expect(err).toBeInstanceOf(Error)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('jwt callback — email-link branch', () => {
  const account: Account = {
    provider: EMAIL_LINK_PROVIDER_ID,
    providerAccountId: 'existing-speaker',
    type: 'credentials',
  }

  beforeEach(() => vi.clearAllMocks())

  it('projects the resolved speaker without re-running OAuth account creation', async () => {
    mockFetch.mockResolvedValueOnce({
      _id: 'existing-speaker',
      slug: 'existing-speaker',
      name: 'Existing Speaker',
      email: 'speaker@example.com',
      organizerOrgIds: ['org-1', 'org-1', ''],
      isOrganizer: true,
      flags: [],
    })

    const token = (await jwtSignInCallback({
      token: {
        sub: 'existing-speaker',
        name: 'Existing Speaker',
        email: 'speaker@example.com',
      } as JWT,
      account,
      trigger: 'signIn',
    })) as JWT

    expect(token.speaker).toMatchObject({
      _id: 'existing-speaker',
      // Deduped and falsy-filtered, exactly like the OAuth path.
      organizerOrgIds: ['org-1'],
    })
    expect(token.account).toEqual(account)
    // No speaker document was created by this path.
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('CLEARS the token when the speaker cannot be loaded', async () => {
    mockFetch.mockResolvedValueOnce(null)
    const token = await jwtSignInCallback({
      token: {
        sub: 'missing',
        name: 'X',
        email: 'x@example.com',
      } as JWT,
      account,
      trigger: 'signIn',
    })
    expect(token).toEqual({})
  })

  it('CLEARS the token when there is no subject to resolve', async () => {
    const token = await jwtSignInCallback({
      token: { name: 'X', email: 'x@example.com' } as JWT,
      account,
      trigger: 'signIn',
    })
    expect(token).toEqual({})
  })
})

/**
 * THE REDEEMED ADDRESS ON THE SESSION (platform#49).
 *
 * `organizerInvite.accept` treats `session.emailLinkIdentifier` as proof that
 * the person holding this session controls that mailbox. These tests cover the
 * WIRING that produces it — everything from `authorize`'s return value to the
 * client-visible session — because the consumer's own tests construct a session
 * object directly and therefore say nothing about whether it is ever populated.
 */
describe('the redeemed-address claim', () => {
  const speaker = {
    _id: 'existing-speaker',
    slug: 'existing-speaker',
    name: 'Existing Speaker',
    email: 'display@example.com',
    organizerOrgIds: [],
    isOrganizer: false,
    flags: [],
  }
  const emailLinkAccount = {
    provider: EMAIL_LINK_PROVIDER_ID,
    providerAccountId: 'existing-speaker',
    type: 'credentials',
  } as unknown as Account

  const baseToken = () =>
    ({
      sub: 'existing-speaker',
      name: 'Existing Speaker',
      email: 'display@example.com',
    }) as JWT

  beforeEach(() => {
    vi.clearAllMocks()
    mockOrgRef.mockResolvedValue('org-1')
  })

  it('carries the address the link was redeemed for onto the JWT', async () => {
    mockFetch.mockResolvedValueOnce(speaker)
    const token = (await jwtSignInCallback({
      token: baseToken(),
      user: { id: 'existing-speaker', emailLinkIdentifier: 'ada@example.com' },
      account: emailLinkAccount,
      trigger: 'signIn',
    })) as JWT

    expect(
      emailLinkIdentifierOf(token as unknown as Record<string, unknown>),
    ).toBe('ada@example.com')
    // Deliberately NOT the speaker's display email — the two differ on purpose,
    // because the proof is about the mailbox, not the profile.
    expect(token.email).toBe('display@example.com')
  })

  it('does NOT carry a claim when the sign-in produced no address', async () => {
    mockFetch.mockResolvedValueOnce(speaker)
    const token = (await jwtSignInCallback({
      token: baseToken(),
      user: { id: 'existing-speaker' },
      account: emailLinkAccount,
      trigger: 'signIn',
    })) as JWT
    expect(
      emailLinkIdentifierOf(token as unknown as Record<string, unknown>),
    ).toBeNull()
  })

  it.each([
    ['a blank string', '   '],
    ['a non-string', 12345],
    ['null', null],
  ])('refuses %s as a claim', async (_label, value) => {
    mockFetch.mockResolvedValueOnce(speaker)
    const token = (await jwtSignInCallback({
      token: baseToken(),
      user: { id: 'existing-speaker', emailLinkIdentifier: value },
      account: emailLinkAccount,
      trigger: 'signIn',
    })) as JWT
    expect(
      emailLinkIdentifierOf(token as unknown as Record<string, unknown>),
    ).toBeNull()
  })

  it('an OAuth sign-in never mints one, even if the user object carries the field', async () => {
    // The claim is stamped ONLY in the email-link branch. An OAuth provider
    // returning a same-named field must not be able to forge a proof.
    mockFetch
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([])
      .mockResolvedValue(null)
    const token = (await jwtSignInCallback({
      token: baseToken(),
      user: { id: 'x', emailLinkIdentifier: 'victim@example.com' },
      account: {
        provider: 'github',
        providerAccountId: '123',
        type: 'oauth',
      } as unknown as Account,
      trigger: 'signIn',
    })) as JWT
    expect(
      emailLinkIdentifierOf(token as unknown as Record<string, unknown>),
    ).toBeNull()
  })

  it('reaches the client-visible session', async () => {
    const session = await sessionCallback({
      session: { user: {} } as unknown as Session,
      token: {
        sub: 'existing-speaker',
        [EMAIL_LINK_IDENTIFIER_CLAIM]: 'ada@example.com',
      } as unknown as JWT,
    })
    expect(session.emailLinkIdentifier).toBe('ada@example.com')
  })

  it('is ABSENT from the session when the JWT has none (fail closed)', async () => {
    const session = await sessionCallback({
      session: { user: {} } as unknown as Session,
      token: { sub: 'existing-speaker' } as unknown as JWT,
    })
    expect(session.emailLinkIdentifier).toBeUndefined()
  })

  it('SURVIVES a `trigger: update` session refresh', async () => {
    // The refresh re-reads the speaker and re-applies its claims. If it dropped
    // this one, a freshly-granted organizer calling `update()` would lose the
    // proof mid-flow.
    mockFetch.mockResolvedValueOnce(speaker)
    const existing = {
      ...baseToken(),
      account: emailLinkAccount,
      speaker,
      [EMAIL_LINK_IDENTIFIER_CLAIM]: 'ada@example.com',
    } as unknown as JWT

    const token = (await jwtSignInCallback({
      token: existing,
      trigger: 'update',
    })) as JWT
    expect(
      emailLinkIdentifierOf(token as unknown as Record<string, unknown>),
    ).toBe('ada@example.com')
  })
})
