/**
 * @vitest-environment node
 *
 * The gallery's reads (#1161), EXECUTED with groq-js against a two-tenant
 * fixture, asserting on the ids that come back. The scope rule lives in the
 * query text — "this edition plus the organization-wide ones", never "has no
 * conference" — so a mocked reader could not prove it.
 *
 * Adversarial fixture: organization B holds an organization-wide asset, one
 * on its own edition and one that (wrongly) points at A's edition, each titled
 * and tagged to match every filter below, so a leak cannot hide behind an empty
 * other tenant.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  queries: [] as string[],
}))

async function run(query: string, params: Record<string, unknown> = {}) {
  h.queries.push(query)
  const value = await evaluate(parse(query), { dataset: h.dataset, params })
  return value.get()
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: run },
  clientWrite: {},
}))

import {
  listMarketingAssetFacets,
  listMarketingAssets,
  readMarketingAssetBackground,
  readMarketingAssetMark,
} from '@/lib/marketing-asset/sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const weak = (id: string) => ({ _type: 'reference', _ref: id, _weak: true })

function asset(
  id: string,
  org: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: id,
    _type: 'marketingAsset',
    _createdAt: '2026-09-01T00:00:00Z',
    organization: ref(org),
    scope: 'organization',
    kind: 'image',
    title: id,
    alt: `alt of ${id}`,
    ...fields,
  }
}

const DATASET = [
  {
    _id: 'conf-a-2026',
    _type: 'conference',
    organization: ref('org-a'),
    title: 'CND 2026',
  },
  {
    _id: 'conf-a-2025',
    _type: 'conference',
    organization: ref('org-a'),
    title: 'CND 2025',
  },
  {
    _id: 'conf-b',
    _type: 'conference',
    organization: ref('org-b'),
    title: 'B 2026',
  },
  { _id: 'sp-ada', _type: 'speaker', name: 'Ada Lovelace', title: 'Engineer' },
  {
    _id: 'talk-1',
    _type: 'talk',
    title: 'Kubernetes at scale',
    conference: ref('conf-a-2026'),
  },
  {
    _id: 'sponsor-1',
    _type: 'sponsor',
    name: 'Acme',
    organization: ref('org-a'),
  },
  asset('logo', 'org-a', {
    title: 'Logo, dark background',
    tags: ['brand', 'logo'],
    _createdAt: '2026-09-03T00:00:00Z',
  }),
  asset('card-2026', 'org-a', {
    scope: 'edition',
    conference: ref('conf-a-2026'),
    title: 'Speaker card',
    tags: ['speaker card'],
    subject: weak('sp-ada'),
    credit: 'Jane Designer',
    _createdAt: '2026-09-02T00:00:00Z',
  }),
  asset('card-2025', 'org-a', {
    scope: 'edition',
    conference: ref('conf-a-2025'),
    title: 'Speaker card from last year',
    tags: ['speaker card', 'brand'],
    subject: weak('sp-ada'),
    _createdAt: '2025-09-02T00:00:00Z',
  }),
  asset('talk-card', 'org-a', {
    scope: 'edition',
    conference: ref('conf-a-2026'),
    title: 'Talk card',
    subject: weak('talk-1'),
    _createdAt: '2026-09-01T00:00:00Z',
  }),
  asset('sponsor-banner', 'org-a', {
    title: 'Sponsor banner',
    subject: weak('sponsor-1'),
    tags: ['sponsors'],
    _createdAt: '2026-08-01T00:00:00Z',
  }),
  // A Studio draft of ours: never a second gallery entry.
  asset('drafts.logo', 'org-a', { title: 'Logo, dark background' }),
  // Organization B, matching every filter.
  asset('b-logo', 'org-b', { title: 'Logo', tags: ['brand', 'logo'] }),
  asset('b-card', 'org-b', {
    scope: 'edition',
    conference: ref('conf-b'),
    title: 'Speaker card',
    tags: ['speaker card'],
    subject: weak('sp-ada'),
  }),
  asset('b-on-our-edition', 'org-b', {
    scope: 'edition',
    conference: ref('conf-a-2026'),
    title: 'Speaker card',
    tags: ['speaker card', 'brand'],
    subject: weak('sp-ada'),
  }),
  // An asset with NO organization at all, matching everything.
  {
    _id: 'orphan',
    _type: 'marketingAsset',
    scope: 'organization',
    title: 'Logo',
    tags: ['brand'],
  },
]

const ids = (rows: { _id: string }[]) => rows.map((row) => row._id)
const list = (filter: Parameters<typeof listMarketingAssets>[2] = {}) =>
  listMarketingAssets('org-a', 'conf-a-2026', filter).then(ids)

beforeEach(() => {
  h.dataset = DATASET
  h.queries = []
})

describe('the default view', () => {
  it('is this edition plus the organization-wide assets, newest first', async () => {
    expect(await list()).toEqual([
      'logo',
      'card-2026',
      'talk-card',
      'sponsor-banner',
    ])
  })

  it('shows a NEW edition the logo, and not last year’s speaker cards', async () => {
    h.dataset = [
      ...DATASET,
      { _id: 'conf-a-2027', _type: 'conference', organization: ref('org-a') },
    ]
    expect(
      await listMarketingAssets('org-a', 'conf-a-2027', {}).then(ids),
    ).toEqual(['logo', 'sponsor-banner'])
  })

  it('never reads "has no conference", and carries no annotation', () => {
    // The assertion is on the text actually sent, after the read above ran.
    return list().then(() => {
      for (const query of h.queries) {
        expect(query).not.toMatch(/defined\(conference/)
        expect(query).toContain('organization._ref == $orgId')
      }
    })
  })
})

describe('all editions', () => {
  it('adds the older editions of THIS organization only', async () => {
    expect(await list({ editions: 'all' })).toEqual([
      'logo',
      'card-2026',
      'talk-card',
      'sponsor-banner',
      'card-2025',
    ])
  })
})

describe('filters and search', () => {
  it('filters by subject, across the default view', async () => {
    expect(await list({ subjectId: 'sp-ada' })).toEqual(['card-2026'])
    expect(await list({ subjectId: 'sp-ada', editions: 'all' })).toEqual([
      'card-2026',
      'card-2025',
    ])
    expect(await list({ subjectId: 'sponsor-1' })).toEqual(['sponsor-banner'])
  })

  it('filters by tag, exactly', async () => {
    expect(await list({ tag: 'brand' })).toEqual(['logo'])
    expect(await list({ tag: 'brand', editions: 'all' })).toEqual([
      'logo',
      'card-2025',
    ])
    // Studio can write any case; the filter still finds it.
    h.dataset = [
      ...DATASET,
      asset('studio-tagged', 'org-a', {
        tags: ['Brand'],
        _createdAt: '2026-09-04T00:00:00Z',
      }),
    ]
    expect(await list({ tag: 'brand' })).toEqual(['studio-tagged', 'logo'])
    expect((await listMarketingAssetFacets('org-a')).tags).toEqual([
      'brand',
      'logo',
      'speaker card',
      'sponsors',
    ])
    h.dataset = DATASET
    // A tag is a whole tag, not a word in one.
    expect(await list({ tag: 'speaker' })).toEqual([])
  })

  it('searches title and tags, by word prefix, every word required', async () => {
    expect(await list({ search: 'log' })).toEqual(['logo'])
    // "sponsors" is only a tag on the banner, "banner" only in its title.
    expect(await list({ search: 'sponsors' })).toEqual(['sponsor-banner'])
    expect(await list({ search: 'banner sponsors' })).toEqual([
      'sponsor-banner',
    ])
    expect(await list({ search: 'card', editions: 'all' })).toEqual([
      'card-2026',
      'talk-card',
      'card-2025',
    ])
    expect(await list({ search: 'card nothing' })).toEqual([])
    // Blank search is no search.
    expect(await list({ search: '   ' })).toEqual([
      'logo',
      'card-2026',
      'talk-card',
      'sponsor-banner',
    ])
  })

  it('combines filters', async () => {
    expect(
      await list({ editions: 'all', tag: 'speaker card', search: 'last' }),
    ).toEqual(['card-2025'])
  })
})

describe('what a row carries', () => {
  it('names its edition, its subject and its credit', async () => {
    const rows = await listMarketingAssets('org-a', 'conf-a-2026', {})
    const card = rows.find((row) => row._id === 'card-2026')
    expect(card).toMatchObject({
      scope: 'edition',
      conferenceId: 'conf-a-2026',
      edition: 'CND 2026',
      subject: { _id: 'sp-ada', _type: 'speaker', name: 'Ada Lovelace' },
      tags: ['speaker card'],
      credit: 'Jane Designer',
    })
    const talk = rows.find((row) => row._id === 'talk-card')
    expect(talk?.subject).toEqual({
      _id: 'talk-1',
      _type: 'talk',
      name: 'Kubernetes at scale',
    })
    const logo = rows.find((row) => row._id === 'logo')
    expect(logo).toMatchObject({
      scope: 'organization',
      conferenceId: null,
      edition: null,
      subject: null,
      credit: null,
    })
  })
})

describe('the filter menus', () => {
  it('offer the tags and subjects of THIS organization’s assets, across editions', async () => {
    const facets = await listMarketingAssetFacets('org-a')
    expect(facets.tags).toEqual(['brand', 'logo', 'speaker card', 'sponsors'])
    expect(facets.subjects).toEqual([
      { _id: 'sponsor-1', _type: 'sponsor', name: 'Acme' },
      { _id: 'sp-ada', _type: 'speaker', name: 'Ada Lovelace' },
      { _id: 'talk-1', _type: 'talk', name: 'Kubernetes at scale' },
    ])
  })
})

describe('the mark an asset keeps', () => {
  it('is its edition, for an asset of THIS organization only', async () => {
    expect(await readMarketingAssetMark('org-a', 'card-2025')).toBe(
      'conf-a-2025',
    )
    expect(await readMarketingAssetMark('org-a', 'logo')).toBeNull()
    // B's asset pointing at our edition is not ours to keep a mark of.
    expect(await readMarketingAssetMark('org-a', 'b-on-our-edition')).toBeNull()
  })
})

describe('an asset as a studio background (#1180)', () => {
  const imageAsset = {
    _id: 'image-hall-3000x2000-jpg',
    _type: 'sanity.imageAsset',
    url: 'https://cdn.sanity.io/images/p/d/hall-3000x2000.jpg',
    metadata: { dimensions: { width: 3000, height: 2000, aspectRatio: 1.5 } },
  }
  const withImage = (id: string, org: string) =>
    asset(id, org, {
      title: 'Keynote hall',
      image: { _type: 'image', asset: ref(imageAsset._id) },
    })
  beforeEach(() => {
    h.dataset = [
      ...DATASET,
      imageAsset,
      withImage('hall', 'org-a'),
      withImage('b-hall', 'org-b'),
      // An asset holding no image (an audio track, #1178).
      asset('track', 'org-a', { kind: 'audio', alt: undefined }),
    ]
  })

  it('reads the image’s URL and size through the reference', async () => {
    expect(await readMarketingAssetBackground('org-a', 'hall')).toEqual({
      title: 'Keynote hall',
      alt: 'alt of hall',
      url: 'https://cdn.sanity.io/images/p/d/hall-3000x2000.jpg',
      width: 3000,
      height: 2000,
    })
  })

  it('is nothing for another organization’s asset', async () => {
    expect(await readMarketingAssetBackground('org-a', 'b-hall')).toBeNull()
  })

  it('has no URL for an asset with no image, and empty alt text, not null', async () => {
    expect(await readMarketingAssetBackground('org-a', 'track')).toEqual({
      title: 'track',
      alt: '',
      url: null,
      width: null,
      height: null,
    })
  })
})
