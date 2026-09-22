import { describe, expect, it, vi, beforeEach } from 'vitest'

const cacheLife = vi.fn()
const cacheTag = vi.fn()
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => cacheLife(...args),
  cacheTag: (...args: unknown[]) => cacheTag(...args),
}))

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

import {
  SHORT_LINK_MISS_LIFE,
  SHORT_LINK_HIT_LIFE,
  resolveShortLink,
  shortLinkTargetFor,
  type ShortLinkRow,
} from './short-link'
import { shortLinkTag } from '@/lib/cache/tags'

const variant = (link: string | null): ShortLinkRow => ({
  _id: 'socialPostVariant.v1',
  _type: 'socialPostVariant',
  link,
  kind: null,
  targetPage: null,
  taskKey: null,
  campaignKey: null,
})

const outreachTask = (over: Partial<ShortLinkRow> = {}): ShortLinkRow => ({
  _id: 'marketingTask.t1',
  _type: 'marketingTask',
  link: null,
  kind: 'speakerOutreach',
  targetPage: '/program',
  taskKey: 'speakerInvite:spk-1',
  campaignKey: 'cfp',
  ...over,
})

describe('shortLinkTargetFor — path AND query only (spec §2.4)', () => {
  it('returns the stored path and query of a variant link', () => {
    expect(
      shortLinkTargetFor(
        variant(
          'https://cloudnativebergen.dev/program?utm_source=bluesky&utm_content=a',
        ),
      ),
    ).toBe('/program?utm_source=bluesky&utm_content=a')
  })

  it('keeps ONLY the path and query of a link stored on a FOREIGN host', () => {
    // The whole open-redirect defence: a hand-edited or demoted host is
    // discarded here, before the route ever builds a Location.
    const target = shortLinkTargetFor(
      variant('https://evil.example/steal?token=abc'),
    )
    expect(target).toBe('/steal?token=abc')
    expect(target).not.toContain('evil.example')
  })

  it('returns null for a stored link that does not parse', () => {
    expect(shortLinkTargetFor(variant('not a url'))).toBeNull()
    expect(shortLinkTargetFor(variant(null))).toBeNull()
  })

  it('returns null for nothing found', () => {
    expect(shortLinkTargetFor(null)).toBeNull()
  })

  it('derives an outreach Task target with utm_source=outreach', () => {
    expect(shortLinkTargetFor(outreachTask())).toBe(
      '/program?utm_source=outreach&utm_medium=social&utm_campaign=cfp&utm_content=speakerInvite%3Aspk-1',
    )
  })

  it('returns null when an outreach target no longer derives', () => {
    // `taggedUrl` throws on a path that is not a site path, and on one that
    // leaves our origin — both must fall back to the home page.
    expect(shortLinkTargetFor(outreachTask({ targetPage: null }))).toBeNull()
    expect(
      shortLinkTargetFor(outreachTask({ targetPage: 'program' })),
    ).toBeNull()
    expect(
      shortLinkTargetFor(outreachTask({ targetPage: '//evil.example/x' })),
    ).toBeNull()
    expect(shortLinkTargetFor(outreachTask({ campaignKey: null }))).toBeNull()
  })

  it('returns null for a marketingTask that is not an outreach Kind', () => {
    // Only outreach Tasks carry a code; a publishing Task's code is on its
    // variant. A non-outreach Task with one is data that should not exist.
    expect(shortLinkTargetFor(outreachTask({ kind: 'checklist' }))).toBeNull()
    expect(shortLinkTargetFor(outreachTask({ kind: 'publishing' }))).toBeNull()
  })
})

describe('resolveShortLink — the cached lookup (spec §2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads ONE root filter over both document types, excluding drafts and versions', async () => {
    fetchMock.mockResolvedValue(null)
    await resolveShortLink('conf-1', 'abc987')
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('_type in ["socialPostVariant", "marketingTask"]')
    expect(query).toContain('!(_id in path("drafts.**"))')
    expect(query).toContain('!(_id in path("versions.**"))')
    // ONE root: tenant scoping only covers the first `*[` of a query.
    expect(query.match(/\*\[/g)).toHaveLength(1)
    expect(params).toMatchObject({ conferenceId: 'conf-1', code: 'abc987' })
  })

  it('tags a hit with the document it came from and gives it a one-day life', async () => {
    fetchMock.mockResolvedValue(
      variant('https://cloudnativebergen.dev/program?utm_source=bluesky'),
    )
    await expect(resolveShortLink('conf-1', 'abc987')).resolves.toBe(
      '/program?utm_source=bluesky',
    )
    expect(cacheTag).toHaveBeenCalledWith(shortLinkTag('socialPostVariant.v1'))
    expect(cacheLife).toHaveBeenCalledTimes(1)
    expect(cacheLife).toHaveBeenCalledWith(SHORT_LINK_HIT_LIFE)
    expect(SHORT_LINK_HIT_LIFE.revalidate).toBe(60 * 60 * 24)
  })

  it('caches a MISS on a short life and with NO document tag', async () => {
    fetchMock.mockResolvedValue(null)
    await expect(resolveShortLink('conf-1', 'abc987')).resolves.toBeNull()
    expect(cacheTag).not.toHaveBeenCalled()
    expect(cacheLife).toHaveBeenCalledTimes(1)
    expect(cacheLife).toHaveBeenCalledWith(SHORT_LINK_MISS_LIFE)
    expect(SHORT_LINK_MISS_LIFE.revalidate).toBeLessThan(
      SHORT_LINK_HIT_LIFE.revalidate,
    )
  })

  it('caches an UNUSABLE hit on the short life but still tags the document', async () => {
    // The document exists, so a repair must be able to expire the entry.
    fetchMock.mockResolvedValue(variant('not a url'))
    await expect(resolveShortLink('conf-1', 'abc987')).resolves.toBeNull()
    expect(cacheTag).toHaveBeenCalledWith(shortLinkTag('socialPostVariant.v1'))
    expect(cacheLife).toHaveBeenCalledWith(SHORT_LINK_MISS_LIFE)
  })
})
