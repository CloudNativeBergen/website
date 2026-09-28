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
  listMarketingAssetsForPost,
  readMarketingAssetForPost,
  readMarketingAssetBackground,
  readMarketingAssetMark,
  readMarketingAssetMedia,
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

describe('audio tracks (#1178)', () => {
  const TRACKS = [
    { _id: 'sp-org', _type: 'speaker', name: 'Olga Organizer' },
    {
      _id: 'file-theme-mp3',
      _type: 'sanity.fileAsset',
      url: 'https://cdn.sanity.io/files/p/d/theme.mp3',
    },
    asset('theme', 'org-a', {
      kind: 'audio',
      alt: undefined,
      title: 'Conference theme',
      tags: ['music'],
      audio: { _type: 'file', asset: ref('file-theme-mp3') },
      createdFileAssetId: 'file-theme-mp3',
      durationSeconds: 83.4,
      rightsConfirmation: {
        confirmedBy: weak('sp-org'),
        confirmedAt: '2026-09-26T08:00:00.000Z',
      },
      _createdAt: '2026-09-05T00:00:00Z',
    }),
    // B's track, matching the kind filter.
    asset('b-theme', 'org-b', {
      kind: 'audio',
      title: 'Theme',
      audio: { _type: 'file', asset: ref('file-theme-mp3') },
    }),
    // Written before `kind` existed: an image.
    { ...asset('kindless', 'org-a'), kind: undefined },
  ]
  beforeEach(() => {
    h.dataset = [...DATASET, ...TRACKS]
  })

  it('filters by kind, within this organization', async () => {
    expect(await list({ kind: 'audio' })).toEqual(['theme'])
    expect(await list({ kind: 'image' })).toEqual([
      'logo',
      'card-2026',
      'talk-card',
      'kindless',
      'sponsor-banner',
    ])
    expect((await list()).length).toBe(6)
  })

  it('carries the track, its length and who confirmed the rights, and no alt text', async () => {
    const [row] = await listMarketingAssets('org-a', 'conf-a-2026', {
      kind: 'audio',
    })
    expect(row).toMatchObject({
      kind: 'audio',
      alt: null,
      audioUrl: 'https://cdn.sanity.io/files/p/d/theme.mp3',
      durationSeconds: 83.4,
      rights: {
        confirmedBy: 'Olga Organizer',
        confirmedAt: '2026-09-26T08:00:00.000Z',
      },
      imageUrl: null,
      softOnSocial: false,
    })
    const [image] = await listMarketingAssets('org-a', 'conf-a-2026', {
      kind: 'image',
    })
    expect(image).toMatchObject({ audioUrl: null, rights: null })
  })

  it('reads a track’s FILE for delete, and an old kindless asset as an image', async () => {
    expect(await readMarketingAssetMedia('org-a', 'theme')).toEqual({
      kind: 'audio',
      assetId: 'file-theme-mp3',
      createdByUpload: true,
    })
    expect(await readMarketingAssetMedia('org-a', 'kindless')).toMatchObject({
      kind: 'image',
    })
    expect(await readMarketingAssetMedia('org-a', 'b-theme')).toBeNull()
  })
})

describe('a studio save’s origin (#1164)', () => {
  beforeEach(() => {
    h.dataset = [
      { _id: 'sp-ada', _type: 'speaker', name: 'Ada' },
      { _id: 'sp-bob', _type: 'speaker', name: 'Bob' },
      {
        _id: 'acme',
        _type: 'sponsor',
        name: 'Acme',
        organization: ref('org-a'),
      },
      {
        _id: 'talk-1',
        _type: 'talk',
        title: 'T',
        conference: ref('conf-a-2026'),
      },
      asset('card', 'org-a', {
        source: 'studio',
        studio: { tab: 'speakers' },
        subject: weak('sp-ada'),
      }),
      // Re-pointed in the gallery: Open in studio follows the subject.
      asset('edited', 'org-a', {
        source: 'studio',
        studio: { tab: 'speakers' },
        subject: weak('sp-bob'),
      }),
      asset('cleared', 'org-a', {
        source: 'studio',
        studio: { tab: 'speakers' },
      }),
      asset('talk-subject', 'org-a', {
        source: 'studio',
        studio: { tab: 'speakers' },
        subject: weak('talk-1'),
      }),
      asset('gone', 'org-a', {
        source: 'studio',
        studio: { tab: 'speakers' },
        subject: weak('sp-erased-and-deleted'),
      }),
      asset('thanks', 'org-a', {
        source: 'studio',
        studio: { tab: 'sponsors' },
        subject: weak('acme'),
      }),
      asset('wrong-tab', 'org-a', {
        source: 'studio',
        studio: { tab: 'sponsors' },
        subject: weak('sp-ada'),
      }),
      asset('meme', 'org-a', {
        source: 'studio',
        studio: { tab: 'meme-generator' },
        subject: weak('sp-ada'),
      }),
      asset('upload', 'org-a', { source: 'upload', subject: weak('sp-ada') }),
      // An upload carrying a stray studio object is still an upload.
      asset('odd', 'org-a', {
        source: 'upload',
        studio: { tab: 'speakers' },
        subject: weak('sp-ada'),
      }),
      asset('old', 'org-a'),
    ]
  })

  it('carries the tab, and the subject when it is that tab’s kind', async () => {
    const rows = await listMarketingAssets('org-a', 'conf-a-2026', {})
    const studio = Object.fromEntries(rows.map((row) => [row._id, row.studio]))
    const speakers = (speakerId: string | null) => ({
      tab: 'speakers',
      speakerId,
      sponsorId: null,
    })
    expect(studio).toEqual({
      card: speakers('sp-ada'),
      edited: speakers('sp-bob'),
      cleared: speakers(null),
      'talk-subject': speakers(null),
      gone: speakers(null),
      thanks: { tab: 'sponsors', speakerId: null, sponsorId: 'acme' },
      'wrong-tab': { tab: 'sponsors', speakerId: null, sponsorId: null },
      meme: { tab: 'meme-generator', speakerId: null, sponsorId: null },
      upload: null,
      odd: null,
      old: null,
    })
  })
})

describe('picking an asset into a post (#1163)', () => {
  const img = (id: string, mimeType = 'image/png') => ({
    _id: id,
    _type: 'sanity.imageAsset',
    mimeType,
    url: `https://cdn.sanity.io/${id}`,
  })
  const imageOf = (assetId: string) => ({
    image: { _type: 'image', asset: ref(assetId) },
  })
  const PNG = (n: string) => `image-${n.repeat(40)}-1200x1200-png`
  const post = (id: string, conf: string, assetIds: string[]) => ({
    _id: id,
    _type: 'socialPost',
    conference: ref(conf),
    attachments: assetIds.map((assetId, i) => ({
      _key: `k${i}`,
      image: { _type: 'image', asset: ref(assetId) },
      alt: 'x',
    })),
  })
  const variant = (id: string, conf: string, postId: string) => ({
    _id: id,
    _type: 'socialPostVariant',
    conference: ref(conf),
    post: ref(postId),
  })
  const task = (
    id: string,
    conf: string,
    variantId: string,
    subject: string,
  ) => ({
    _id: id,
    _type: 'marketingTask',
    conference: ref(conf),
    variant: weak(variantId),
    subject: weak(subject),
  })

  const PICKER = [
    ...DATASET.filter((d) => d._type !== 'marketingAsset'),
    img(PNG('a')),
    img(PNG('b')),
    img(PNG('c')),
    img(PNG('d')),
    img(PNG('e')),
    img(
      'image-ffffffffffffffffffffffffffffffffffffffff-400x400-gif',
      'image/gif',
    ),
    asset('logo', 'org-a', {
      ...imageOf(PNG('a')),
      _createdAt: '2026-09-05T00:00:00Z',
    }),
    asset('card-2026', 'org-a', {
      ...imageOf(PNG('b')),
      scope: 'edition',
      conference: ref('conf-a-2026'),
      _createdAt: '2026-09-04T00:00:00Z',
    }),
    // About the post's subject, from LAST year: it still leads.
    asset('ada-2025', 'org-a', {
      ...imageOf(PNG('c')),
      scope: 'edition',
      conference: ref('conf-a-2025'),
      subject: weak('sp-ada'),
      _createdAt: '2025-09-01T00:00:00Z',
    }),
    asset('old-2025', 'org-a', {
      ...imageOf(PNG('d')),
      scope: 'edition',
      conference: ref('conf-a-2025'),
      _createdAt: '2025-08-01T00:00:00Z',
    }),
    asset('ada-org', 'org-a', {
      ...imageOf(PNG('e')),
      subject: weak('sp-ada'),
      _createdAt: '2026-01-01T00:00:00Z',
    }),
    asset('party-gif', 'org-a', {
      ...imageOf('image-ffffffffffffffffffffffffffffffffffffffff-400x400-gif'),
      _createdAt: '2026-09-06T00:00:00Z',
    }),
    asset('track', 'org-a', { kind: 'audio', alt: undefined }),
    asset('b-ada', 'org-b', {
      ...imageOf(PNG('a')),
      subject: weak('sp-ada'),
    }),
    post('post-ada', 'conf-a-2026', [PNG('a')]),
    variant('v-ada', 'conf-a-2026', 'post-ada'),
    task('task-ada', 'conf-a-2026', 'v-ada', 'sp-ada'),
    // A Task of ANOTHER conference pointing at our post names no subject.
    task('task-b', 'conf-b', 'v-ada', 'sponsor-1'),
    post('post-plain', 'conf-a-2026', []),
  ]

  beforeEach(() => {
    h.dataset = PICKER
  })

  const pick = (
    postId: string,
    filter: Parameters<typeof listMarketingAssetsForPost>[3] = {},
  ) =>
    listMarketingAssetsForPost('org-a', 'conf-a-2026', postId, filter).then(ids)

  it("lists the post's subject first, then this edition, then the organization's, then older editions", async () => {
    expect(await pick('post-ada', { editions: 'all' })).toEqual([
      'ada-org',
      'ada-2025',
      'card-2026',
      'party-gif',
      'logo',
      'old-2025',
    ])
  })

  it('without a subject: this edition, then the organization; older editions only on request', async () => {
    expect(await pick('post-plain')).toEqual([
      'card-2026',
      'party-gif',
      'logo',
      'ada-org',
    ])
  })

  it('searches within the same order', async () => {
    h.dataset = PICKER.map((d) =>
      d._id === 'ada-2025' || d._id === 'logo'
        ? { ...d, tags: ['keynote'] }
        : d,
    )
    expect(await pick('post-ada', { search: 'keyn', editions: 'all' })).toEqual(
      ['ada-2025', 'logo'],
    )
  })

  it('never scans the posts for usage: the picker does not show it', async () => {
    const rows = await listMarketingAssetsForPost(
      'org-a',
      'conf-a-2026',
      'post-ada',
      { editions: 'all' },
    )
    expect(h.queries.some((q) => q.includes('"socialPost"'))).toBe(false)
    expect(rows.every((row) => row.usedInPosts === null)).toBe(true)
  })

  it('marks a GIF as not attachable, and never lists a track', async () => {
    const rows = await listMarketingAssetsForPost(
      'org-a',
      'conf-a-2026',
      'post-plain',
      {},
    )
    const attachable = Object.fromEntries(
      rows.map((row) => [row._id, row.attachable]),
    )
    expect(attachable).toEqual({
      'card-2026': true,
      'party-gif': false,
      logo: true,
      'ada-org': true,
    })
  })

  it("counts the posts using an asset's image, in THIS organization only", async () => {
    h.dataset = [
      ...PICKER,
      post('post-2025', 'conf-a-2025', [PNG('a'), PNG('b')]),
      // Another tenant's post holding the same bytes, and a Studio draft.
      post('post-b', 'conf-b', [PNG('a')]),
      post('drafts.post-ada', 'conf-a-2026', [PNG('a')]),
      // The same image twice in one post is one post.
      post('post-twice', 'conf-a-2026', [PNG('d'), PNG('d')]),
    ]
    const rows = await listMarketingAssets('org-a', 'conf-a-2026', {
      editions: 'all',
    })
    const used = Object.fromEntries(
      rows.map((row) => [row._id, row.usedInPosts]),
    )
    expect(used).toMatchObject({
      logo: 2,
      'card-2026': 1,
      'old-2025': 1,
      'ada-org': 0,
    })
  })

  it("reads an asset's image, alt, crop and whether it can go into a post", async () => {
    h.dataset = [
      ...PICKER.filter((d) => d._id !== 'logo'),
      asset('logo', 'org-a', {
        _rev: 'rev-logo',
        image: {
          _type: 'image',
          asset: ref(PNG('a')),
          hotspot: {
            _type: 'sanity.imageHotspot',
            x: 0.5,
            y: 0.4,
            width: 1,
            height: 1,
          },
          crop: {
            _type: 'sanity.imageCrop',
            top: 0,
            bottom: 0.1,
            left: 0,
            right: 0,
          },
        },
      }),
    ]
    expect(await readMarketingAssetForPost('org-a', 'logo')).toEqual({
      rev: 'rev-logo',
      imageAssetId: PNG('a'),
      alt: 'alt of logo',
      hotspot: { x: 0.5, y: 0.4, width: 1, height: 1 },
      crop: { top: 0, bottom: 0.1, left: 0, right: 0 },
      attachable: true,
    })
    expect(await readMarketingAssetForPost('org-a', 'party-gif')).toMatchObject(
      {
        attachable: false,
      },
    )
    expect(await readMarketingAssetForPost('org-a', 'track')).toMatchObject({
      attachable: false,
    })
    // Scoped: another organization's asset reads as nothing.
    expect(await readMarketingAssetForPost('org-a', 'b-ada')).toBeNull()
  })
})
