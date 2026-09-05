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
const patchCommitMock = vi.fn(async () => ({ _id: 'img-1' }))
const patchMock = vi.fn()
patchMock.mockImplementation(() => {
  const chain = {
    set: vi.fn(() => chain),
    unset: vi.fn(() => chain),
    setIfMissing: vi.fn(() => chain),
    append: vi.fn(() => chain),
    commit: patchCommitMock,
  }
  return chain
})
const transactionCommitMock = vi.fn(async () => ({}))
const transactionMock = vi.fn()
transactionMock.mockImplementation(() => ({
  delete: vi.fn(),
  commit: transactionCommitMock,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: {
    fetch: (...args: unknown[]) => fetchMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/gallery/events', () => ({
  publishSpeakerTaggedEvent: vi.fn(),
}))

import {
  getGalleryImages,
  getGalleryImageCount,
  getFeaturedGalleryImages,
  getGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  untagSpeakerFromImage,
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

/**
 * BY-ID reads (#616, S10). A document id is a dataset-wide key, so every by-id
 * gallery read now carries the request tenant IN the query — the router guard
 * (`requireImageInConference` / `requireImageInOrg`) is control #1, the
 * predicate is control #2, and a foreign id resolves to nothing, exactly like a
 * nonexistent one. SABOTAGE: removing the predicate fails the `toContain`
 * assertions; removing a null-result refusal fails the "nothing is written"
 * assertions.
 */
describe('by-id gallery reads carry the tenant predicate (#616)', () => {
  it('getGalleryImage binds the conference into the point read', async () => {
    fetchMock.mockResolvedValue(null)
    await getGalleryImage('img-1', 'conf-1')

    const [query, params] = fetchMock.mock.calls[0]
    expect(String(query)).toContain(
      'conference._ref == $conferenceId && _id == $id',
    )
    expect(params).toMatchObject({ id: 'img-1', conferenceId: 'conf-1' })
  })

  it('updateGalleryImage scopes the original-speakers read and REFUSES a foreign id with 404, writing nothing', async () => {
    fetchMock.mockResolvedValue(null) // scoped read: not ours / nonexistent

    const res = await updateGalleryImage(
      'img-foreign',
      { speakers: ['sp-1'] },
      'conf-1',
    )

    const [query, params] = fetchMock.mock.calls[0]
    expect(String(query)).toContain('conference._ref == $conferenceId')
    expect(params).toMatchObject({ id: 'img-foreign', conferenceId: 'conf-1' })
    expect(res).toEqual({ error: 'Gallery image not found', status: 404 })
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('deleteGalleryImage scopes the asset read and REFUSES a foreign id: no delete transaction', async () => {
    fetchMock.mockResolvedValue(null)

    await expect(deleteGalleryImage('img-foreign', 'conf-1')).resolves.toBe(
      false,
    )

    const [query, params] = fetchMock.mock.calls[0]
    expect(String(query)).toContain('conference._ref == $conferenceId')
    expect(params).toMatchObject({ id: 'img-foreign', conferenceId: 'conf-1' })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('deleteGalleryImage still deletes the OWN-tenant image (single-tenant behaviour unchanged)', async () => {
    fetchMock
      .mockResolvedValueOnce({ assetId: 'asset-1' }) // scoped by-id read
      .mockResolvedValueOnce(1) // asset still referenced elsewhere

    await expect(deleteGalleryImage('img-1', 'conf-1')).resolves.toBe(true)
    expect(transactionCommitMock).toHaveBeenCalledTimes(1)
  })

  it('untagSpeakerFromImage scopes by the ORG and refuses a foreign image without patching', async () => {
    fetchMock.mockResolvedValue(null)

    const res = await untagSpeakerFromImage('img-foreign', 'sp-1', 'org-A')

    const [query, params] = fetchMock.mock.calls[0]
    expect(String(query)).toContain('conference->organization._ref == $orgId')
    expect(params).toMatchObject({ imageId: 'img-foreign', orgId: 'org-A' })
    expect(res).toEqual({ success: false, error: 'Image not found' })
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('untagSpeakerFromImage still untags within the own tenant', async () => {
    fetchMock.mockResolvedValue({
      speakers: [{ _ref: 'sp-1', _key: 'speaker-sp-1' }],
      untaggedSpeakers: [],
    })

    const res = await untagSpeakerFromImage('img-1', 'sp-1', 'org-A')
    expect(res).toEqual({ success: true })
    expect(patchMock).toHaveBeenCalledWith('img-1')
  })
})
