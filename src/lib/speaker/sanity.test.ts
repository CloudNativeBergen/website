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

// Multi-tenant org resolution (CaaS T1-1). Defaults to "no org" so the base
// tests exercise the pre-backfill behaviour (no membership stamping); the
// membership tests below override it.
const orgRefMock = vi.fn().mockResolvedValue(null)
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: () => orgRefMock(),
}))

const setIfMissingMock = vi.fn()
const insertMock = vi.fn()

import {
  attachProviderToSpeaker,
  getOrCreateSpeaker,
  getSpeakers,
  getOrganizers,
} from './sanity'

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
  orgRefMock.mockResolvedValue(null)
  commitMock.mockResolvedValue({})
  setMock.mockImplementation(() => ({ commit: commitMock, unset: unsetMock }))
  unsetMock.mockImplementation(() => ({ commit: commitMock }))
  insertMock.mockImplementation(() => ({ commit: commitMock }))
  setIfMissingMock.mockImplementation(() => ({ insert: insertMock }))
  patchMock.mockImplementation(() => ({
    set: setMock,
    unset: unsetMock,
    setIfMissing: setIfMissingMock,
  }))
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

describe('getOrCreateSpeaker — organization membership (CaaS T1-1)', () => {
  it('appends the current org to a returning speaker missing that membership', async () => {
    orgRefMock.mockResolvedValue('org-1')
    // Provider match; the membership-presence count query resolves falsy.
    fetchMock.mockImplementation(routeFetch({ provider: existingSpeaker() }))

    const { err } = await getOrCreateSpeaker(user(), githubAccount())

    expect(err).toBeNull()
    expect(patchMock).toHaveBeenCalledWith('spk-existing')
    expect(setIfMissingMock).toHaveBeenCalledWith({ organizations: [] })
    expect(insertMock).toHaveBeenCalledWith('after', 'organizations[-1]', [
      { _type: 'reference', _ref: 'org-1', _key: 'org-1' },
    ])
  })

  it('does not append when the speaker already belongs to the org', async () => {
    orgRefMock.mockResolvedValue('org-1')
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('$id in providers'))
        return Promise.resolve(existingSpeaker())
      // Membership-presence check: already a member.
      if (query.includes('in coalesce(organizations, [])[]._ref'))
        return Promise.resolve(true)
      return Promise.resolve(null)
    })

    await getOrCreateSpeaker(user(), githubAccount())

    expect(insertMock).not.toHaveBeenCalled()
  })

  it('does nothing when no org resolves (pre-backfill / no domain)', async () => {
    orgRefMock.mockResolvedValue(null)
    fetchMock.mockImplementation(routeFetch({ provider: existingSpeaker() }))

    await getOrCreateSpeaker(user(), githubAccount())

    expect(insertMock).not.toHaveBeenCalled()
  })

  it('seeds membership on a freshly created speaker', async () => {
    orgRefMock.mockResolvedValue('org-1')
    // No provider match and no email match -> create path.
    fetchMock.mockImplementation(routeFetch({ provider: {}, emailMatches: [] }))

    const { err } = await getOrCreateSpeaker(user(), githubAccount())

    expect(err).toBeNull()
    expect(createMock).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith('after', 'organizations[-1]', [
      { _type: 'reference', _ref: 'org-1', _key: 'org-1' },
    ])
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

  // LinkedIn: only an EXPLICIT false/"false" blocks the link. LinkedIn asserts
  // only the holder's own verified primary, so absent/true are treated verified.
  it.each([
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
      // Explicitly unverified -> no link, fresh speaker.
      expect(patchMock).not.toHaveBeenCalled()
      expect(createMock).toHaveBeenCalledTimes(1)
      expect(speaker._id).not.toBe('spk-existing')
    },
  )

  // LinkedIn: true, the string 'true', and an ABSENT claim are all treated as
  // verified (LinkedIn only asserts the holder's own verified email).
  it.each([
    ['boolean true', true],
    ['string "true"', 'true'],
    ['absent', undefined],
  ])(
    'treats the LinkedIn primary as verified when email_verified is %s',
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
      // Verified -> links into the existing speaker.
      expect(createMock).not.toHaveBeenCalled()
      expect(patchMock).toHaveBeenCalledWith('spk-existing')
      expect(speaker._id).toBe('spk-existing')
    },
  )
})

describe('getOrCreateSpeaker — email link accrues org membership (#615)', () => {
  it('stamps the current org after linking via a single verified-email match', async () => {
    // The email-link path historically linked the provider but never stamped the
    // tenant membership the provider/create paths do — this covers that fix.
    orgRefMock.mockResolvedValue('org-1')
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'jane@example.com', verified: true }],
    })
    fetchMock.mockImplementation(
      routeFetch({ provider: {}, emailMatches: [existingSpeaker()] }),
    )

    const { speaker, err } = await getOrCreateSpeaker(user(), githubAccount())

    expect(err).toBeNull()
    expect(speaker._id).toBe('spk-existing')
    // Linked into the existing speaker AND accrued the current-org membership.
    expect(patchMock).toHaveBeenCalledWith('spk-existing')
    expect(insertMock).toHaveBeenCalledWith('after', 'organizations[-1]', [
      { _type: 'reference', _ref: 'org-1', _key: 'org-1' },
    ])
  })
})

describe('getOrCreateSpeaker — org-preference among ambiguous matches (#615)', () => {
  it('links into the SINGLE current-org member when the global match is ambiguous', async () => {
    orgRefMock.mockResolvedValue('org-1')
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'jane@example.com', verified: true }],
    })
    const member = existingSpeaker({
      _id: 'spk-member',
      organizations: ['org-1'],
    })
    const nonMember = existingSpeaker({
      _id: 'spk-other',
      _createdAt: '2025-01-01T00:00:00Z',
      organizations: ['org-2'],
    })
    fetchMock.mockImplementation(
      routeFetch({ provider: {}, emailMatches: [member, nonMember] }),
    )

    const { speaker, err } = await getOrCreateSpeaker(user(), githubAccount())

    expect(err).toBeNull()
    // Narrowed to the one tenant member -> link into it, do not create a new doc.
    expect(createMock).not.toHaveBeenCalled()
    expect(patchMock).toHaveBeenCalledWith('spk-member')
    expect(speaker._id).toBe('spk-member')
  })

  it('stays ambiguous (creates new) when multiple matches are current-org members', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    orgRefMock.mockResolvedValue('org-1')
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'jane@example.com', verified: true }],
    })
    const memberA = existingSpeaker({
      _id: 'spk-a',
      organizations: ['org-1'],
    })
    const memberB = existingSpeaker({
      _id: 'spk-b',
      _createdAt: '2025-01-01T00:00:00Z',
      organizations: ['org-1'],
    })
    fetchMock.mockImplementation(
      routeFetch({ provider: {}, emailMatches: [memberA, memberB] }),
    )

    const { speaker } = await getOrCreateSpeaker(user(), githubAccount())

    // Two org members -> still ambiguous, fall through to a fresh speaker.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ambiguous verified-email match'),
    )
    expect(patchMock).not.toHaveBeenCalledWith('spk-a')
    expect(patchMock).not.toHaveBeenCalledWith('spk-b')
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(speaker._id).not.toBe('spk-a')
    expect(speaker._id).not.toBe('spk-b')
    warnSpy.mockRestore()
  })

  it('stays ambiguous (creates new) when no org resolves (pre-backfill)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    orgRefMock.mockResolvedValue(null)
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'jane@example.com', verified: true }],
    })
    fetchMock.mockImplementation(
      routeFetch({
        provider: {},
        emailMatches: [
          existingSpeaker({ _id: 'spk-a', organizations: ['org-1'] }),
          existingSpeaker({ _id: 'spk-b', organizations: ['org-2'] }),
        ],
      }),
    )

    const { speaker } = await getOrCreateSpeaker(user(), githubAccount())

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ambiguous verified-email match'),
    )
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(speaker._id).not.toBe('spk-a')
    expect(speaker._id).not.toBe('spk-b')
    warnSpy.mockRestore()
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

// --- Org-scoped admin lookups (#615) ---------------------------------------

describe('getSpeakers — org scoping', () => {
  it('adds the membership+participation predicate and binds $orgId', async () => {
    fetchMock.mockResolvedValue([])

    await getSpeakers('conf-1', undefined, true, 'org-1')

    const [query, params] = fetchMock.mock.calls[0]
    // Membership clause OR pre-backfill participation fallback.
    expect(query).toContain('in coalesce(organizations, [])[]._ref')
    expect(query).toContain('conference->organization._ref == $orgId')
    expect(params).toMatchObject({ conferenceId: 'conf-1', orgId: 'org-1' })
  })

  it('leaves the list unscoped (no org predicate/param) when orgId is null', async () => {
    fetchMock.mockResolvedValue([])

    await getSpeakers('conf-1', undefined, true, null)

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).not.toContain('$orgId')
    expect(params).not.toHaveProperty('orgId')
  })
})

/**
 * REGRESSION (#616): `includeProposalsFromOtherConferences` with NO org id left
 * the NESTED proposals projection completely unscoped (`''`), so a speaker who
 * has spoken for two organizations had BOTH organizations' proposals rendered —
 * on the admin badge page and the admin speakers page, which both called exactly
 * that way. It is also a `'use cache'` function, so the cross-org result cached
 * under a tenant-looking key.
 */
describe('getSpeakers — the nested proposals projection is never unscoped (#616)', () => {
  /**
   * The filter of the nested `"proposals": *[ … ]` projection — bracket-matched,
   * because the status list (`status in ["confirmed", …]`) nests brackets.
   */
  function proposalsFilter(query: string): string {
    const open = query.indexOf('"proposals": *[')
    expect(open).toBeGreaterThan(-1)
    const from = open + '"proposals": *['.length
    let depth = 1
    for (let i = from; i < query.length; i++) {
      if (query[i] === '[') depth++
      else if (query[i] === ']') {
        depth--
        if (depth === 0) return query.slice(from, i)
      }
    }
    throw new Error('unterminated proposals projection')
  }

  it('scopes cross-conference proposals to the ORG when an org id is passed', async () => {
    fetchMock.mockResolvedValue([])

    await getSpeakers('conf-1', undefined, true, 'org-1')

    const filter = proposalsFilter(fetchMock.mock.calls[0][0])
    expect(filter).toContain('conference->organization._ref == $orgId')
  })

  it('FAILS CLOSED to this conference when cross-conference is asked for WITHOUT an org', async () => {
    fetchMock.mockResolvedValue([])

    await getSpeakers('conf-1', undefined, true, null)

    const filter = proposalsFilter(fetchMock.mock.calls[0][0])
    // The decisive assertion: some conference/org predicate is present, so the
    // projection can never span the dataset.
    expect(filter).toContain('conference._ref == $conferenceId')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ conferenceId: 'conf-1' })
  })

  it('scopes to this conference when cross-conference is NOT requested', async () => {
    fetchMock.mockResolvedValue([])

    await getSpeakers('conf-1', undefined, false, 'org-1')

    expect(proposalsFilter(fetchMock.mock.calls[0][0])).toContain(
      'conference._ref == $conferenceId',
    )
  })

  it('refuses to run at all with neither a conference nor an org', async () => {
    fetchMock.mockResolvedValue([])

    const { speakers, err } = await getSpeakers(
      undefined,
      undefined,
      true,
      null,
    )

    expect(speakers).toEqual([])
    expect(err).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getOrganizers — org scoping', () => {
  it('scopes organizers to the current org conferences and binds $orgId', async () => {
    fetchMock.mockResolvedValue([])

    await getOrganizers('org-1')

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('organization._ref == $orgId')
    expect(params).toEqual({ orgId: 'org-1' })
  })

  // FAIL CLOSED (#723 shape). A null org used to return EVERY tenant's
  // organizers, and was reachable by simply omitting the argument.
  // MUTATION CHECK: delete the `if (!orgId)` guard in `getOrganizers` and this
  // test fails — the global organizer query goes out again.
  it('FAILS CLOSED on a null org: no query, no organizers', async () => {
    fetchMock.mockResolvedValue([])

    const { speakers, err } = await getOrganizers(null)

    expect(speakers).toEqual([])
    expect(err).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never emits the global organizer scope', async () => {
    fetchMock.mockResolvedValue([])

    await getOrganizers('org-1')

    const [query] = fetchMock.mock.calls[0]
    expect(query).not.toContain('*[_type == "conference"].organizers')
  })
})

// --- Phase 2: attachProviderToSpeaker (self-service linking) ----------------

interface AttachRoutes {
  providerOwner?: Speaker | Record<string, never> | null
  target?: Speaker | null
  takenSlugs?: Set<string>
}

function attachRouteFetch(routes: AttachRoutes) {
  const taken = routes.takenSlugs ?? new Set<string>()
  return (query: string, params: Record<string, unknown> = {}) => {
    if (query.includes('$id in providers')) {
      return Promise.resolve(routes.providerOwner ?? {})
    }
    if (query.includes('_id == $speakerId')) {
      return Promise.resolve(routes.target ?? null)
    }
    if (query.includes('slug.current == $slug')) {
      return Promise.resolve(
        taken.has(params.slug as string) ? 'taken-id' : null,
      )
    }
    return Promise.resolve(null)
  }
}

describe('attachProviderToSpeaker — explicit self-service link', () => {
  it('attaches a new provider to the EXISTING speaker without creating a doc', async () => {
    // Speaker X currently only has LinkedIn; we link a GitHub account to X.
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'jane.work@corp.com', verified: true }],
    })
    const target = existingSpeaker({
      _id: 'spk-x',
      providers: ['linkedin:li-456'],
      knownEmails: ['jane@example.com'],
    })
    fetchMock.mockImplementation(
      attachRouteFetch({ providerOwner: {}, target }),
    )

    const { speaker, status, err } = await attachProviderToSpeaker(
      'spk-x',
      user({ email: 'jane@example.com' }),
      githubAccount(),
    )

    expect(err).toBeNull()
    expect(status).toBe('linked')
    expect(createMock).not.toHaveBeenCalled()
    expect(patchMock).toHaveBeenCalledWith('spk-x')
    expect(speaker._id).toBe('spk-x')
    // Gains the second provider (deduped) ...
    expect(speaker.providers).toEqual(
      expect.arrayContaining(['linkedin:li-456', 'github:gh-123']),
    )
    // ... and this login's VERIFIED email is unioned into knownEmails.
    expect(speaker.knownEmails).toEqual(
      expect.arrayContaining(['jane@example.com', 'jane.work@corp.com']),
    )
  })

  it('accrues the current-org membership on a successful self-service link (#615)', async () => {
    orgRefMock.mockResolvedValue('org-1')
    verifiedEmailsMock.mockResolvedValue({ error: null, emails: [] })
    const target = existingSpeaker({
      _id: 'spk-x',
      providers: ['linkedin:li-456'],
    })
    // Bespoke routing: the membership-presence count query also contains
    // `_id == $speakerId`, so it must be matched BEFORE the target lookup and
    // resolve falsy (not yet a member) for the append to fire.
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('$id in providers')) return Promise.resolve({})
      if (query.includes('in coalesce(organizations, [])[]._ref'))
        return Promise.resolve(false)
      if (query.includes('_id == $speakerId')) return Promise.resolve(target)
      return Promise.resolve(null)
    })

    const { err } = await attachProviderToSpeaker(
      'spk-x',
      user({ email: 'jane@example.com' }),
      githubAccount(),
    )

    expect(err).toBeNull()
    expect(insertMock).toHaveBeenCalledWith('after', 'organizations[-1]', [
      { _type: 'reference', _ref: 'org-1', _key: 'org-1' },
    ])
  })

  it('does NOT merge when the provider is already linked to another speaker', async () => {
    // The GitHub account already belongs to a DIFFERENT speaker Z.
    const otherSpeaker = existingSpeaker({ _id: 'spk-z' })
    fetchMock.mockImplementation(
      attachRouteFetch({
        providerOwner: otherSpeaker,
        target: existingSpeaker({ _id: 'spk-x' }),
      }),
    )

    const { speaker, status, err } = await attachProviderToSpeaker(
      'spk-x',
      user({ email: 'jane@example.com' }),
      githubAccount(),
    )

    expect(err).toBeNull()
    expect(status).toBe('already-linked-elsewhere')
    // Neither document is mutated — merging is the Phase-3 admin tool.
    expect(patchMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
    // Surfaces the conflicting speaker so the UI can advise contacting organizers.
    expect(speaker._id).toBe('spk-z')
  })

  it('is idempotent when the provider is already linked to the same speaker', async () => {
    verifiedEmailsMock.mockResolvedValue({ error: null, emails: [] })
    const target = existingSpeaker({
      _id: 'spk-x',
      providers: ['github:gh-123'],
    })
    fetchMock.mockImplementation(
      attachRouteFetch({ providerOwner: target, target }),
    )

    const { speaker, status, err } = await attachProviderToSpeaker(
      'spk-x',
      user({ email: 'jane@example.com' }),
      githubAccount(),
    )

    expect(err).toBeNull()
    expect(status).toBe('linked')
    expect(createMock).not.toHaveBeenCalled()
    expect(speaker.providers).toEqual(['github:gh-123'])
  })

  it('fails closed when the user has no email (cannot compute verified set)', async () => {
    fetchMock.mockImplementation(
      attachRouteFetch({
        providerOwner: {},
        target: existingSpeaker({ _id: 'spk-x' }),
      }),
    )

    const { status, err } = await attachProviderToSpeaker(
      'spk-x',
      { name: 'Jane Doe' } as User,
      githubAccount(),
    )

    expect(err).toBeInstanceOf(Error)
    expect(status).toBe('linked')
    expect(patchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// #684 — email identity matching must be normalization-insensitive.
//
// These tests drive the WHOLE login path against an in-memory store whose fetch
// stub is an honest emulator of the GROQ predicate the query actually asks for:
// it folds the STORED side with `toLowerCase()` only when the query text
// contains `lower(`. Combined with the store recording what gets written, this
// bites on both axes — drop `lower()` from the query, or stop normalizing the
// incoming address, and the "one speaker, not two" assertions fail.
// ---------------------------------------------------------------------------

interface StoreDoc {
  _id: string
  email?: string
  knownEmails?: string[]
  providers?: string[]
  slug?: string
}

function loginRouteFetch(store: StoreDoc[]) {
  return (query: string, params: Record<string, unknown> = {}) => {
    if (query.includes('$id in providers')) {
      const id = params.id as string
      return Promise.resolve(
        store.find((doc) => (doc.providers ?? []).includes(id)) ?? {},
      )
    }
    if (query.includes('in $emails')) {
      const emails = params.emails as string[]
      // Fold the stored side ONLY if the query asked for it (`lower(...)`).
      const folds = query.includes('lower(')
      const fold = (value: string) => (folds ? value.toLowerCase() : value)
      return Promise.resolve(
        store.filter(
          (doc) =>
            (doc.email !== undefined && emails.includes(fold(doc.email))) ||
            (doc.knownEmails ?? []).some((known) =>
              emails.includes(fold(known)),
            ),
        ),
      )
    }
    if (query.includes('slug.current == $slug')) {
      return Promise.resolve(null)
    }
    return Promise.resolve(null)
  }
}

/**
 * Wire `clientWrite.create` so created documents land in `store` in the shape
 * the login PROJECTION returns them (`"slug": slug.current`), which is what a
 * subsequent login reads back.
 */
function recordCreatesInto(store: StoreDoc[]) {
  createMock.mockImplementation((doc: Record<string, unknown>) => {
    const slug = doc.slug as { current?: string } | string | undefined
    store.push({
      ...(doc as unknown as StoreDoc),
      slug: typeof slug === 'string' ? slug : slug?.current,
    })
    return Promise.resolve({ ...doc })
  })
}

describe('getOrCreateSpeaker — email identity matching is normalized (#684)', () => {
  it('resolves two provider casings of one mailbox to ONE speaker', async () => {
    const store: StoreDoc[] = []
    fetchMock.mockImplementation(loginRouteFetch(store))
    recordCreatesInto(store)

    // First login: GitHub hands back the mixed-case form.
    verifiedEmailsMock.mockResolvedValue({
      error: null,
      emails: [{ email: 'Hans@Example.com', verified: true, primary: true }],
    })
    const first = await getOrCreateSpeaker(
      user({ name: 'Hans Doe', email: 'Hans@Example.com' }),
      githubAccount(),
    )
    expect(first.err).toBeNull()
    expect(store).toHaveLength(1)

    // Second login: LinkedIn hands back the SAME mailbox, all lowercase.
    createMock.mockClear()
    const second = await getOrCreateSpeaker(
      user({ name: 'Hans Doe', email: 'hans@example.com' }),
      linkedinAccount(),
    )

    expect(second.err).toBeNull()
    // The duplicate-account defect: a second document must NOT be created.
    expect(createMock).not.toHaveBeenCalled()
    expect(store).toHaveLength(1)
    expect(second.speaker._id).toBe(first.speaker._id)
  })

  it('matches a LEGACY record whose stored display email is mixed-case', async () => {
    // Pre-existing document, never migrated — exactly what production holds.
    const store: StoreDoc[] = [
      {
        _id: 'spk-legacy',
        email: 'Hans@Example.com',
        providers: ['github:gh-999'],
      },
    ]
    fetchMock.mockImplementation(loginRouteFetch(store))
    recordCreatesInto(store)
    verifiedEmailsMock.mockResolvedValue({ error: null, emails: [] })

    const { speaker, err } = await getOrCreateSpeaker(
      user({ name: 'Hans Doe', email: 'hans@example.com' }),
      linkedinAccount(),
    )

    expect(err).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
    expect(speaker._id).toBe('spk-legacy')
  })

  it('does not create a second record for a whitespace-padded address', async () => {
    const store: StoreDoc[] = [
      {
        _id: 'spk-legacy',
        email: 'hans@example.com',
        providers: ['github:gh-999'],
      },
    ]
    fetchMock.mockImplementation(loginRouteFetch(store))
    recordCreatesInto(store)
    verifiedEmailsMock.mockResolvedValue({ error: null, emails: [] })

    const { speaker, err } = await getOrCreateSpeaker(
      user({ name: 'Hans Doe', email: '  hans@example.com \n' }),
      linkedinAccount(),
    )

    expect(err).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
    expect(speaker._id).toBe('spk-legacy')
  })

  it('still creates a separate speaker for a genuinely different address', async () => {
    const store: StoreDoc[] = [
      {
        _id: 'spk-legacy',
        email: 'hans@example.com',
        knownEmails: ['hans@example.com'],
        providers: ['github:gh-999'],
      },
    ]
    fetchMock.mockImplementation(loginRouteFetch(store))
    recordCreatesInto(store)
    verifiedEmailsMock.mockResolvedValue({ error: null, emails: [] })

    const { speaker, err } = await getOrCreateSpeaker(
      user({ name: 'Other Person', email: 'hans@example.org' }),
      linkedinAccount(),
    )

    expect(err).toBeNull()
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(speaker._id).not.toBe('spk-legacy')
    expect(store).toHaveLength(2)
  })

  it('stores the display email of a NEW speaker in normalized form', async () => {
    const store: StoreDoc[] = []
    fetchMock.mockImplementation(loginRouteFetch(store))
    recordCreatesInto(store)
    verifiedEmailsMock.mockResolvedValue({ error: null, emails: [] })

    await getOrCreateSpeaker(
      user({ name: 'Hans Doe', email: '  Hans@Example.COM ' }),
      linkedinAccount(),
    )

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'hans@example.com' }),
    )
  })
})
