import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Account, User, Profile } from 'next-auth'
import type { Speaker } from './types'

// --- Mocks -----------------------------------------------------------------

const fetchMock = vi.fn()
const createMock = vi.fn()
const commitMock = vi.fn().mockResolvedValue({})
const setMock = vi.fn()
const unsetMock = vi.fn()
const patchMock = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientReadCached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: {
    fetch: (...args: unknown[]) => fetchMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
  speakerImageUrl: vi.fn(),
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const verifiedEmailsMock = vi.fn()
vi.mock('@/lib/profile/github', () => ({
  verifiedEmails: (...args: unknown[]) => verifiedEmailsMock(...args),
}))

import { getOrCreateSpeaker } from './sanity'

// --- Fetch routing helpers -------------------------------------------------

interface Routes {
  provider?: Speaker | Record<string, never> | null
  emailMatches?: Speaker[]
  takenSlugs?: Set<string>
}

function routeFetch(routes: Routes) {
  const taken = routes.takenSlugs ?? new Set<string>()
  return (query: string, params: Record<string, unknown> = {}) => {
    if (query.includes('$id in providers')) {
      return Promise.resolve(routes.provider ?? {})
    }
    if (query.includes('in $emails')) {
      return Promise.resolve(routes.emailMatches ?? [])
    }
    if (query.includes('slug.current == $slug')) {
      return Promise.resolve(
        taken.has(params.slug as string) ? 'taken-id' : null,
      )
    }
    return Promise.resolve(null)
  }
}

function githubAccount(): Account {
  return {
    provider: 'github',
    providerAccountId: 'gh-123',
    type: 'oauth',
    access_token: 'gh-token',
  } as Account
}

function linkedinAccount(): Account {
  return {
    provider: 'linkedin',
    providerAccountId: 'li-456',
    type: 'oidc',
  } as Account
}

function user(overrides: Partial<User> = {}): User {
  return { name: 'Jane Doe', email: 'jane@example.com', ...overrides } as User
}

function existingSpeaker(overrides: Partial<Speaker> = {}): Speaker {
  return {
    _id: 'spk-existing',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Jane Doe',
    email: 'jane@example.com',
    slug: 'jane-doe',
    providers: ['github:gh-123'],
    knownEmails: ['jane@example.com'],
    ...overrides,
  } as Speaker
}

beforeEach(() => {
  vi.clearAllMocks()
  commitMock.mockResolvedValue({})
  setMock.mockImplementation(() => ({ commit: commitMock, unset: unsetMock }))
  unsetMock.mockImplementation(() => ({ commit: commitMock }))
  patchMock.mockImplementation(() => ({ set: setMock, unset: unsetMock }))
  createMock.mockImplementation((doc: Record<string, unknown>) =>
    Promise.resolve({ ...doc }),
  )
  verifiedEmailsMock.mockResolvedValue({ error: null, emails: [] })
})

// --- Tests -----------------------------------------------------------------

describe('getOrCreateSpeaker — provider id match', () => {
  it('returns the speaker matched by provider account id without writing', async () => {
    fetchMock.mockImplementation(routeFetch({ provider: existingSpeaker() }))

    const { speaker, err } = await getOrCreateSpeaker(user(), githubAccount())

    expect(err).toBeNull()
    expect(speaker._id).toBe('spk-existing')
    expect(createMock).not.toHaveBeenCalled()
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('backfills a missing slug on an existing provider match', async () => {
    fetchMock.mockImplementation(
      routeFetch({ provider: existingSpeaker({ slug: '' }) }),
    )

    const { speaker, err } = await getOrCreateSpeaker(user(), githubAccount())

    expect(err).toBeNull()
    expect(patchMock).toHaveBeenCalledWith('spk-existing')
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: { _type: 'slug', current: 'jane-doe' },
      }),
    )
    expect(speaker.slug).toBe('jane-doe')
  })

  it('never rewrites an existing non-empty slug', async () => {
    fetchMock.mockImplementation(
      routeFetch({ provider: existingSpeaker({ slug: 'jane-doe' }) }),
    )

    await getOrCreateSpeaker(user(), githubAccount())

    expect(patchMock).not.toHaveBeenCalled()
  })
})

describe('getOrCreateSpeaker — verified email cross-provider link', () => {
  it('links a new provider into the speaker matched by a verified email', async () => {
    // Incoming login is LinkedIn (li-456) with the same verified email.
    verifiedEmailsMock.mockResolvedValue({ error: null, emails: [] })
    fetchMock.mockImplementation(
      routeFetch({
        provider: {}, // no provider match
        emailMatches: [existingSpeaker()],
      }),
    )

    const { speaker, err } = await getOrCreateSpeaker(
      user({ email: 'jane@example.com' }),
      linkedinAccount(),
      { email_verified: true } as Profile,
    )

    expect(err).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
    expect(patchMock).toHaveBeenCalledWith('spk-existing')
    // Both provider ids present, deduped.
    expect(speaker.providers).toEqual(
      expect.arrayContaining(['github:gh-123', 'linkedin:li-456']),
    )
    expect(speaker.knownEmails).toContain('jane@example.com')
  })

  it('unions verified emails from both providers into knownEmails', async () => {
    // GitHub login; API reports two verified emails, existing speaker known via one.
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [
        { email: 'Jane@Example.com', verified: true },
        { email: 'jane.work@corp.com', verified: true },
      ],
    })
    fetchMock.mockImplementation(
      routeFetch({
        provider: {},
        emailMatches: [
          existingSpeaker({
            providers: ['linkedin:li-456'],
            knownEmails: ['jane@example.com'],
          }),
        ],
      }),
    )

    const { speaker } = await getOrCreateSpeaker(
      user({ email: 'jane@example.com' }),
      githubAccount(),
    )

    expect(speaker.knownEmails).toEqual(
      expect.arrayContaining(['jane@example.com', 'jane.work@corp.com']),
    )
    expect(speaker.providers).toEqual(
      expect.arrayContaining(['linkedin:li-456', 'github:gh-123']),
    )
  })
})

describe('getOrCreateSpeaker — verified-only security invariant', () => {
  it('does NOT link on an unverified LinkedIn email; creates a new speaker', async () => {
    const emailMatchesSpy = existingSpeaker()
    fetchMock.mockImplementation(
      routeFetch({
        provider: {},
        emailMatches: [emailMatchesSpy], // would match if we queried
      }),
    )

    const { speaker, err } = await getOrCreateSpeaker(
      user({ email: 'jane@example.com' }),
      linkedinAccount(),
      { email_verified: false } as Profile,
    )

    expect(err).toBeNull()
    // No verified email -> no link, a fresh speaker is created.
    expect(patchMock).not.toHaveBeenCalled()
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(speaker._id).not.toBe('spk-existing')
  })

  // H2 — LinkedIn email_verified must be affirmatively true. Absent / string
  // 'false' must NOT be treated as verified (previously fail-open).
  it.each([
    ['absent', undefined],
    ['string "false"', 'false'],
    ['boolean false', false],
  ])(
    'does NOT treat the LinkedIn primary as verified when email_verified is %s',
    async (_label, claim) => {
      fetchMock.mockImplementation(
        routeFetch({ provider: {}, emailMatches: [existingSpeaker()] }),
      )

      const { speaker, err } = await getOrCreateSpeaker(
        user({ email: 'jane@example.com' }),
        linkedinAccount(),
        { email_verified: claim } as unknown as Profile,
      )

      expect(err).toBeNull()
      // Unverified -> no link, fresh speaker.
      expect(patchMock).not.toHaveBeenCalled()
      expect(createMock).toHaveBeenCalledTimes(1)
      expect(speaker._id).not.toBe('spk-existing')
    },
  )

  // H2 — the stringified OIDC claim 'true' is honored as verified.
  it('treats the LinkedIn primary as verified when email_verified is the string "true"', async () => {
    fetchMock.mockImplementation(
      routeFetch({ provider: {}, emailMatches: [existingSpeaker()] }),
    )

    const { speaker, err } = await getOrCreateSpeaker(
      user({ email: 'jane@example.com' }),
      linkedinAccount(),
      { email_verified: 'true' } as unknown as Profile,
    )

    expect(err).toBeNull()
    // Verified -> links into the existing speaker.
    expect(createMock).not.toHaveBeenCalled()
    expect(patchMock).toHaveBeenCalledWith('spk-existing')
    expect(speaker._id).toBe('spk-existing')
  })
})

describe('getOrCreateSpeaker — multiple existing matches', () => {
  it('does NOT link into an ambiguous match; creates a new speaker and warns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'jane@example.com', verified: true }],
    })
    const older = existingSpeaker({ _id: 'spk-old' })
    const newer = existingSpeaker({
      _id: 'spk-new',
      _createdAt: '2025-01-01T00:00:00Z',
    })
    fetchMock.mockImplementation(
      routeFetch({ provider: {}, emailMatches: [older, newer] }),
    )

    const { speaker } = await getOrCreateSpeaker(user(), githubAccount())

    // H1: ambiguous multi-match must NOT auto-link into any existing doc.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ambiguous verified-email match'),
    )
    // Neither existing speaker is patched...
    expect(patchMock).not.toHaveBeenCalledWith('spk-old')
    expect(patchMock).not.toHaveBeenCalledWith('spk-new')
    // ...instead a brand-new speaker is created for this login.
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(speaker._id).not.toBe('spk-old')
    expect(speaker._id).not.toBe('spk-new')
    warnSpy.mockRestore()
  })
})

describe('getOrCreateSpeaker — new speaker creation', () => {
  it('creates a speaker with a unique non-empty slug and seeded knownEmails', async () => {
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'jane@example.com', verified: true }],
    })
    fetchMock.mockImplementation(routeFetch({ provider: {}, emailMatches: [] }))

    const { speaker, err } = await getOrCreateSpeaker(user(), githubAccount())

    expect(err).toBeNull()
    expect(createMock).toHaveBeenCalledTimes(1)
    const created = createMock.mock.calls[0][0]
    expect(created.slug.current).toBe('jane-doe')
    expect(created.knownEmails).toContain('jane@example.com')
    expect(speaker.slug).toBe('jane-doe')
  })

  it('appends a suffix when the slug is already taken', async () => {
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'jane@example.com', verified: true }],
    })
    fetchMock.mockImplementation(
      routeFetch({
        provider: {},
        emailMatches: [],
        takenSlugs: new Set(['jane-doe']),
      }),
    )

    const { speaker } = await getOrCreateSpeaker(user(), githubAccount())

    expect(speaker.slug).toBe('jane-doe-2')
  })

  it('falls back to a stable slug for an emoji-only name', async () => {
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'emoji@example.com', verified: true }],
    })
    fetchMock.mockImplementation(routeFetch({ provider: {}, emailMatches: [] }))

    const { speaker } = await getOrCreateSpeaker(
      user({ name: '🎤🎤', email: 'emoji@example.com' }),
      githubAccount(),
    )

    expect(speaker.slug).toBe('speaker')
  })
})
