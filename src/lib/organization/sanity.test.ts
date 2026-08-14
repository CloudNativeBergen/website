import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

/**
 * `'use cache'` is a COMPILER DIRECTIVE; under vitest nothing transforms it, so
 * the cached function's BODY runs and its `cacheLife`/`cacheTag` calls are real
 * imports. Capturing them here is what makes the caching claim falsifiable at
 * all — the alternative (as an earlier draft of this PR had it) is a cache
 * declaration no test can see, which is indistinguishable from no declaration.
 * Same technique as `src/app/api/provisioning/cache/invalidate/coherence.test.ts`.
 */
const cacheCalls = vi.hoisted(() => ({
  life: [] as string[],
  tags: [] as string[],
}))
vi.mock('next/cache', () => ({
  cacheLife: (profile: string) => cacheCalls.life.push(profile),
  cacheTag: (tag: string) => cacheCalls.tags.push(tag),
}))

const getConferenceForCurrentDomainMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceForCurrentDomainMock(...args),
}))

import {
  organizationField,
  organizationReference,
  getOrganizationRefForCurrentConference,
  getOrganizationRefViaParentConference,
  getOrganizationSecretEnvSlugs,
  readOrganizationSecretEnvSlugs,
} from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  cacheCalls.life.length = 0
  cacheCalls.tags.length = 0
})

// --- organizationField / organizationReference -----------------------------

describe('organizationField', () => {
  it('spreads a reference field for a present org id', () => {
    expect(organizationField('org-1')).toEqual({
      organization: { _type: 'reference', _ref: 'org-1' },
    })
  })

  it('spreads nothing for null/undefined/empty', () => {
    expect(organizationField(null)).toEqual({})
    expect(organizationField(undefined)).toEqual({})
    expect(organizationField('')).toEqual({})
  })
})

describe('organizationReference', () => {
  it('builds a bare reference or undefined', () => {
    expect(organizationReference('org-1')).toEqual({
      _type: 'reference',
      _ref: 'org-1',
    })
    expect(organizationReference(null)).toBeUndefined()
  })
})

// --- getOrganizationRefForCurrentConference --------------------------------

describe('getOrganizationRefForCurrentConference', () => {
  it('returns the current conference organization ref', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValue({
      conference: { _id: 'conf-1', organization: { _ref: 'org-1' } },
      error: null,
    })
    expect(await getOrganizationRefForCurrentConference()).toBe('org-1')
  })

  it('returns null when the conference has no organization (pre-backfill)', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValue({
      conference: { _id: 'conf-1' },
      error: null,
    })
    expect(await getOrganizationRefForCurrentConference()).toBeNull()
  })

  it('returns null on a resolution error', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValue({
      conference: {},
      error: new Error('no domain'),
    })
    expect(await getOrganizationRefForCurrentConference()).toBeNull()
  })

  it('swallows a thrown error and returns null (never a write gate)', async () => {
    getConferenceForCurrentDomainMock.mockRejectedValue(new Error('boom'))
    expect(await getOrganizationRefForCurrentConference()).toBeNull()
  })
})

// --- getOrganizationRefViaParentConference ---------------------------------

describe('getOrganizationRefViaParentConference', () => {
  it('dereferences the parent conference organization ref', async () => {
    fetchMock.mockResolvedValue('org-1')
    const ref = await getOrganizationRefViaParentConference('conversation-1')
    expect(ref).toBe('org-1')
    // The GROQ must traverse parent -> conference -> organization.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('conference->organization._ref'),
      { parentId: 'conversation-1' },
    )
  })

  it('returns null for a missing parent id without querying', async () => {
    expect(await getOrganizationRefViaParentConference(null)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when the parent chain has no organization', async () => {
    fetchMock.mockResolvedValue(null)
    expect(await getOrganizationRefViaParentConference('x')).toBeNull()
  })

  it('swallows a query error and returns null', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    expect(await getOrganizationRefViaParentConference('x')).toBeNull()
  })
})

// --- readOrganizationSecretEnvSlugs ----------------------------------------

/**
 * The tenant → env-var-slug map (RunKonf/platform#57). The QUERY is what is
 * pinned here, because the two things that can go wrong in it are invisible at
 * runtime: it must be restricted to `organization` documents, and it must
 * exclude drafts. A draft copy arrives as `drafts.<id>`, which matches no org id
 * the resolver is ever asked about AND reads as a SECOND organization holding
 * the same slug — so an unpublished edit would make the resolver refuse
 * credentials for the live tenant it was edited from.
 */
describe('readOrganizationSecretEnvSlugs', () => {
  it('asks only for published organizations that carry a slug', async () => {
    fetchMock.mockResolvedValue([])
    await readOrganizationSecretEnvSlugs()

    const [query] = fetchMock.mock.calls[0] as [string]
    expect(query).toContain('_type == "organization"')
    expect(query).toContain('defined(secretEnvSlug)')
    expect(query).toContain('!(_id in path("drafts.**"))')
    // The projection carries the id and the label, and nothing else — no
    // contact email, no plan, no tenant data on a cross-tenant read.
    expect(query).toMatch(/\{\s*_id,\s*secretEnvSlug\s*\}/)
  })

  it('returns an empty list rather than null when nothing matches', async () => {
    fetchMock.mockResolvedValue(null)
    await expect(readOrganizationSecretEnvSlugs()).resolves.toEqual([])
  })

  it('propagates a failed read — it must never look like "no slugs"', async () => {
    // The distinction the whole design rests on: an empty list is an ANSWER,
    // a rejection is not, and the resolver branches on which one it got.
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))
    await expect(readOrganizationSecretEnvSlugs()).rejects.toThrow(
      'ECONNREFUSED',
    )
  })
})

// --- getOrganizationSecretEnvSlugs (the cached wrapper) --------------------

/**
 * WHAT IS REAL HERE AND WHAT IS NOT. Real: the function body, and the exact
 * `cacheLife`/`cacheTag` arguments it registers. Not real: Next's storage and
 * eviction, which no unit test can exercise. The property worth pinning is the
 * one that silently breaks — a cached read declaring a tag nobody revalidates,
 * or declaring none at all and re-fetching on every send.
 */
describe('getOrganizationSecretEnvSlugs — the cache declaration', () => {
  it('declares an hours lifetime and the shared organizations tag', async () => {
    fetchMock.mockResolvedValue([])
    await getOrganizationSecretEnvSlugs()

    expect(cacheCalls.life).toEqual(['hours'])
    // The SAME tag `getOrganizationById` carries, so anything already busting
    // the organization reads busts this map too.
    expect(cacheCalls.tags).toContain('content:organizations')
  })

  it('tags every organization it returns, so an org mutation busts the map', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'org-a', secretEnvSlug: 'AAA' },
      { _id: 'org-b', secretEnvSlug: 'BBB' },
    ])
    await getOrganizationSecretEnvSlugs()

    expect(cacheCalls.tags).toContain('sanity:organization-org-a')
    expect(cacheCalls.tags).toContain('sanity:organization-org-b')
    // Asserted as a VALUE, not a count: a tag builder that drifted from
    // `organizationTag` would make the invalidation a silent no-op, which is
    // the failure this pins (see the cache-coherence test for the full story).
  })

  it('registers no per-org tag for an empty dataset', async () => {
    fetchMock.mockResolvedValue([])
    await getOrganizationSecretEnvSlugs()
    expect(cacheCalls.tags).toEqual(['content:organizations'])
  })
})
