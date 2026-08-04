import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * REGRESSION (#616): gallery reads were UNSCOPED BY CONSTRUCTION.
 *
 * The old root filter was
 *   `(!defined($conferenceId) || conference._ref == $conferenceId || !defined(conference))`
 * which returned
 *   1. the ENTIRE dataset's images whenever no conference id was passed — the
 *      speaker "my photos" endpoints passed only a `speakerId`, and the
 *      unknown-host branch of `getConferenceForDomain` deliberately fetched with
 *      no id at all; and
 *   2. every conference-LESS image to every tenant, via `!defined(conference)`.
 *
 * These tests assert the SHAPE of the emitted GROQ, not just a happy path, so a
 * future edit that re-introduces an optional tenant predicate fails here rather
 * than in review.
 */

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

vi.mock('@/lib/gallery/events', () => ({
  publishSpeakerTaggedEvent: vi.fn(),
}))

import {
  getGalleryImages,
  getGalleryImageCount,
  getFeaturedGalleryImages,
} from './sanity'

/** The two — and only two — tenant predicates a gallery read may carry. */
const CONFERENCE_SCOPE = 'conference._ref == $conferenceId'
const ORG_SCOPE = 'conference->organization._ref == $orgId'

function lastQuery(): string {
  const call = fetchMock.mock.calls.at(-1)
  return String(call?.[0] ?? '')
}

function lastParams(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1)
  return (call?.[1] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([])
})

describe('gallery reads are tenant-scoped by construction (#616)', () => {
  it('getGalleryImages scopes to the conference UNCONDITIONALLY', async () => {
    await getGalleryImages({ conferenceId: 'conf-1', limit: 10 })

    const query = lastQuery()
    expect(query).toContain(CONFERENCE_SCOPE)
    // The predicate must NOT be conditional on the parameter being defined…
    expect(query).not.toContain('!defined($conferenceId)')
    // …and conference-LESS images must NOT be readmitted.
    expect(query).not.toContain('!defined(conference)')
    expect(lastParams()).toMatchObject({ conferenceId: 'conf-1' })
  })

  it('getGalleryImageCount scopes to the conference UNCONDITIONALLY', async () => {
    fetchMock.mockResolvedValue(0)
    await getGalleryImageCount({ conferenceId: 'conf-1' })

    const query = lastQuery()
    expect(query).toContain(CONFERENCE_SCOPE)
    expect(query).not.toContain('!defined($conferenceId)')
    expect(lastParams()).toMatchObject({ conferenceId: 'conf-1' })
  })

  it('getFeaturedGalleryImages scopes to the conference', async () => {
    await getFeaturedGalleryImages(8, 'conf-1')

    expect(lastQuery()).toContain(CONFERENCE_SCOPE)
    expect(lastParams()).toMatchObject({
      conferenceId: 'conf-1',
      featured: true,
    })
  })

  it('the ORG scope (cross-edition "my photos") stays inside one organization', async () => {
    await getGalleryImages({ orgId: 'org-A', speakerId: 'sp-1' })

    const query = lastQuery()
    expect(query).toContain(ORG_SCOPE)
    expect(query).not.toContain('!defined(conference)')
    expect(lastParams()).toMatchObject({ orgId: 'org-A', speakerId: 'sp-1' })
  })

  it('EVERY emitted gallery query carries one of the two tenant predicates', async () => {
    fetchMock.mockResolvedValue([])
    await getGalleryImages({ conferenceId: 'conf-1' })
    await getGalleryImages({ orgId: 'org-A' })
    await getGalleryImageCount({ conferenceId: 'conf-1' })
    await getGalleryImageCount({ orgId: 'org-A' })
    await getFeaturedGalleryImages(4, 'conf-1')

    expect(fetchMock).toHaveBeenCalledTimes(5)
    for (const [query] of fetchMock.mock.calls) {
      const q = String(query)
      expect(q).toContain('_type == "imageGallery"')
      expect(
        q.includes(CONFERENCE_SCOPE) || q.includes(ORG_SCOPE),
        `unscoped gallery query emitted:\n${q}`,
      ).toBe(true)
    }
  })
})

describe('gallery reads FAIL CLOSED without a tenant scope (#616)', () => {
  // The type system rejects these call shapes; the runtime guard is the second
  // line of defence for an id that is present but empty (an unresolved
  // conference threaded through as `''`/undefined).
  const unscoped = {} as { conferenceId: string }
  const blank = { conferenceId: '' }

  it('getGalleryImages returns [] and issues NO query when the scope is missing', async () => {
    await expect(getGalleryImages(unscoped)).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getGalleryImages returns [] and issues NO query when the id is blank', async () => {
    await expect(getGalleryImages(blank)).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getGalleryImageCount returns 0 and issues NO query when the scope is missing', async () => {
    await expect(getGalleryImageCount(unscoped)).resolves.toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getFeaturedGalleryImages returns [] for a blank conference id', async () => {
    await expect(getFeaturedGalleryImages(8, '' as string)).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
