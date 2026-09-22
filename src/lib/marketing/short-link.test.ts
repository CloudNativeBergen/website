import { describe, expect, it, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'

const cacheLife = vi.fn()
const cacheTag = vi.fn()
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => cacheLife(...args),
  cacheTag: (...args: unknown[]) => cacheTag(...args),
}))

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

import {
  SHORT_LINK_INDEX_CAP,
  SHORT_LINK_INDEX_LIFE,
  SHORT_LINK_MISS_LIFE,
  SHORT_LINK_HIT_LIFE,
  conferenceShortCodeIndex,
  resolveShortLink,
  shortLinkTargetFor,
  type ShortLinkRow,
} from './short-link'
import { shortLinkIndexTag, shortLinkTag } from '@/lib/cache/tags'

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

  it('collapses a PROTOCOL-RELATIVE path, which would otherwise be an open redirect', () => {
    // `new URL('https://ours.dev//evil.example/x').pathname` is
    // `//evil.example/x`, and resolving THAT against our origin is a
    // network-path reference: it lands on evil.example. Collapsing the
    // leading slashes keeps the request on our host, where the page simply
    // 404s (§2.4: the redirect does not second-guess the link).
    const target = shortLinkTargetFor(
      variant('https://cloudnativebergen.dev//evil.example/x?a=1'),
    )
    expect(target).toBe('/evil.example/x?a=1')
    expect(
      new URL(target!, 'https://cloudnativebergen.dev/go/abc987').host,
    ).toBe('cloudnativebergen.dev')
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

describe('the lookup query, evaluated for real (tenant scoping)', () => {
  /**
   * Runs the EXACT query the module sent, against a dataset, rather than
   * asserting on its text. A Studio edit can point a Task at another
   * conference's Campaign, and an unrestricted `campaign->key` would put that
   * tenant's key into THIS conference's `utm_campaign`.
   */
  async function campaignKeyFor(campaignConference: string) {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(null)
    await resolveShortLink('conf-A', 'abc987')
    const [query, params] = fetchMock.mock.calls[0]
    const dataset = [
      {
        _id: 'conf-A',
        _type: 'conference',
      },
      {
        _id: 'campaign-1',
        _type: 'marketingCampaign',
        key: 'cfp',
        conference: { _ref: campaignConference },
      },
      {
        _id: 'task-1',
        _type: 'marketingTask',
        shortCode: 'abc987',
        kind: 'speakerOutreach',
        targetPage: '/program',
        key: 'speakerInvite:spk-1',
        conference: { _ref: 'conf-A' },
        campaign: { _ref: 'campaign-1' },
      },
    ]
    const row = await (
      await evaluate(parse(query as string), {
        dataset,
        params: params as Record<string, unknown>,
      })
    ).get()
    return row
  }

  it("reads the campaign key when the Campaign is THIS conference's", async () => {
    const row = await campaignKeyFor('conf-A')
    // The control: without this passing, the null below proves nothing —
    // it could just mean the row never matched at all.
    expect(row).toMatchObject({ _id: 'task-1', campaignKey: 'cfp' })
  })

  it("does NOT read another conference's campaign key", async () => {
    const row = await campaignKeyFor('conf-B')
    // On the VALUE: the Task is still found (it is this conference's Task),
    // but the foreign key is not borrowed. `outreachLink` then treats the
    // missing key as "does not derive" — the home page, not a cross-tenant
    // attribution in utm_campaign.
    expect(row).toMatchObject({ _id: 'task-1' })
    expect(row.campaignKey).toBeNull()
  })
})

describe('conferenceShortCodeIndex — a scanner costs nothing (spec §2.4)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads ONE tenant-scoped root, excluding drafts and versions', async () => {
    fetchMock.mockResolvedValue([])
    await conferenceShortCodeIndex('conf-1')
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('_type in ["socialPostVariant", "marketingTask"]')
    // The index must never admit a code the RESOLVER would refuse, or a
    // draft's code would pass the gate and buy a read.
    expect(query).toContain('!(_id in path("drafts.**"))')
    expect(query).toContain('!(_id in path("versions.**"))')
    expect(query.match(/\*\[/g)).toHaveLength(1)
    expect(params).toMatchObject({ conferenceId: 'conf-1' })
    // No `$code`: the whole point is that it is not per-code.
    expect(query).not.toContain('$code')
  })

  it('tags per CONFERENCE and lives an hour', async () => {
    fetchMock.mockResolvedValue(['abc987'])
    await conferenceShortCodeIndex('conf-1')
    expect(cacheTag).toHaveBeenCalledWith(shortLinkIndexTag('conf-1'))
    expect(cacheLife).toHaveBeenCalledWith(SHORT_LINK_INDEX_LIFE)
    expect(SHORT_LINK_INDEX_LIFE.revalidate).toBe(60 * 60)
  })

  it('returns the set of codes the conference holds', async () => {
    fetchMock.mockResolvedValue(['abc987', 'defg23', null, 7])
    const index = await conferenceShortCodeIndex('conf-1')
    expect(index).toBeInstanceOf(Set)
    expect([...index!].sort()).toEqual(['abc987', 'defg23'])
  })

  it('NORMALIZES what it indexes, so an uppercase stored code still resolves', async () => {
    // The route normalizes before it asks (`index.has(normalized)`), and a
    // stored code is not guaranteed lowercase: `shortCodeForMutation`
    // normalizes on write and `createShortCodeMinter` normalizes when
    // checking what is taken, so `ABC987` is reachable, supported data.
    // Indexing it raw makes `has('abc987')` false and sends a REAL short
    // link to the home page.
    fetchMock.mockResolvedValue(['ABC987', 'DeFg23'])
    const index = await conferenceShortCodeIndex('conf-1')
    expect([...index!].sort()).toEqual(['abc987', 'defg23'])
    // On the VALUE the route actually asks with:
    expect(index!.has('abc987')).toBe(true)
    expect(index!.has('ABC987')).toBe(false)
  })

  it('asks Sanity for at most the cap + 1 rows', async () => {
    // The over-cap branch discards every code it was sent, so without a
    // slice it pays to transfer an index it then refuses to build.
    fetchMock.mockResolvedValue([])
    await conferenceShortCodeIndex('conf-1')
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('[0...$cap]')
    expect(params.cap).toBe(SHORT_LINK_INDEX_CAP + 1)
  })

  it('fails OPEN on a shape it does not recognise, never "holds nothing"', async () => {
    // Reading an unexpected answer as an empty set would send every real
    // short link to the home page — far worse than the read it saves.
    fetchMock.mockResolvedValue({ unexpected: true })
    await expect(conferenceShortCodeIndex('conf-1')).resolves.toBeNull()
    fetchMock.mockResolvedValue(null)
    await expect(conferenceShortCodeIndex('conf-1')).resolves.toBeNull()
  })

  it('fails OPEN past the cap rather than start denying real codes', async () => {
    fetchMock.mockResolvedValue(
      Array.from({ length: SHORT_LINK_INDEX_CAP + 1 }, (_, i) => `c${i}`),
    )
    await expect(conferenceShortCodeIndex('conf-1')).resolves.toBeNull()
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
