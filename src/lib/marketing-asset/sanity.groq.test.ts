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
  readMarketingAssetGif,
  readMarketingAssetMedia,
} from '@/lib/marketing-asset/sanity'
import {
  croppedSize,
  formatMismatchWarning,
} from '@/lib/marketing-asset/channel-format'

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
      fileId: expect.stringMatching(/^image-/),
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
      fileId: null,
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
      files: [
        { assetId: 'file-theme-mp3', type: 'file', createdByUpload: true },
      ],
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
      // Captured in a Format (#1247); everything before Formats reads square.
      {
        _id: 'image-wide-1200x628-png',
        _type: 'sanity.imageAsset',
        url: 'https://cdn.sanity.io/images/p/d/wide-1200x628.png',
        mimeType: 'image/png',
        metadata: { dimensions: { width: 1200, height: 628 } },
      },
      asset('wide', 'org-a', {
        source: 'studio',
        studio: { tab: 'speakers', format: 'landscape' },
        subject: weak('sp-ada'),
        image: { _type: 'image', asset: ref('image-wide-1200x628-png') },
      }),
      // The same pixels, uploaded by hand: a short side under 1080.
      asset('wide-upload', 'org-a', {
        source: 'upload',
        image: { _type: 'image', asset: ref('image-wide-1200x628-png') },
      }),
      asset('upload', 'org-a', { source: 'upload', subject: weak('sp-ada') }),
      // An upload carrying a stray studio object is still an upload — and
      // its Format never exempts it from the soft warning.
      asset('odd', 'org-a', {
        source: 'upload',
        studio: { tab: 'speakers', format: 'landscape' },
        subject: weak('sp-ada'),
        image: { _type: 'image', asset: ref('image-wide-1200x628-png') },
      }),
      asset('old', 'org-a'),
    ]
  })

  it('never calls a card at its Format’s own pixels soft, while the same upload is (#1247)', async () => {
    const rows = await listMarketingAssets('org-a', 'conf-a-2026', {})
    const soft = Object.fromEntries(
      rows.map((row) => [row._id, row.softOnSocial]),
    )
    expect(soft.wide).toBe(false)
    expect(soft['wide-upload']).toBe(true)
    expect(soft.odd).toBe(true)
  })

  it('carries the tab, and the subject when it is that tab’s kind', async () => {
    const rows = await listMarketingAssets('org-a', 'conf-a-2026', {})
    const studio = Object.fromEntries(rows.map((row) => [row._id, row.studio]))
    const speakers = (speakerId: string | null) => ({
      tab: 'speakers',
      speakerId,
      sponsorId: null,
      project: null,
      format: 'square',
    })
    const none = { project: null, format: 'square' }
    expect(studio).toEqual({
      card: speakers('sp-ada'),
      wide: { ...speakers('sp-ada'), format: 'landscape' },
      edited: speakers('sp-bob'),
      cleared: speakers(null),
      'talk-subject': speakers(null),
      gone: speakers(null),
      thanks: { tab: 'sponsors', speakerId: null, sponsorId: 'acme', ...none },
      'wrong-tab': {
        tab: 'sponsors',
        speakerId: null,
        sponsorId: null,
        ...none,
      },
      meme: {
        tab: 'meme-generator',
        speakerId: null,
        sponsorId: null,
        ...none,
      },
      'wide-upload': null,
      upload: null,
      odd: null,
      old: null,
    })
  })
})

describe('a video exported from a studio project (#1182)', () => {
  const clip = (id: string, extra: Record<string, unknown>) =>
    asset(id, 'org-a', {
      kind: 'video',
      alt: undefined,
      source: 'studio',
      studio: { tab: 'meme-generator' },
      video: { _type: 'file', asset: ref('file-clip-mp4') },
      poster: { _type: 'image', asset: ref('image-poster-1080x1080-jpg') },
      ...extra,
    })
  beforeEach(() => {
    h.dataset = [
      {
        _id: 'vp-live',
        _type: 'videoProject',
        organization: ref('org-a'),
        title: 'Teaser',
      },
      { _id: 'drafts.vp-draft-only', _type: 'videoProject', title: 'Draft' },
      clip('from-live', { project: weak('vp-live') }),
      clip('from-deleted', { project: weak('vp-deleted') }),
      // Only a Studio draft exists: the studio cannot open it.
      clip('from-draft', { project: weak('vp-draft-only') }),
      clip('unsaved', {}),
      // A stray project reference on an upload is not a studio origin.
      asset('upload-with-ref', 'org-a', {
        source: 'upload',
        project: weak('vp-live'),
      }),
    ]
  })

  it('names the project, and whether it still exists', async () => {
    const rows = await listMarketingAssets('org-a', 'conf-a-2026', {})
    const studio = Object.fromEntries(rows.map((row) => [row._id, row.studio]))
    const meme = (project: { _id: string; exists: boolean } | null) => ({
      tab: 'meme-generator',
      speakerId: null,
      sponsorId: null,
      project,
      format: 'square',
    })
    expect(studio).toEqual({
      'from-live': meme({ _id: 'vp-live', exists: true }),
      'from-deleted': meme({ _id: 'vp-deleted', exists: false }),
      'from-draft': meme({ _id: 'vp-draft-only', exists: false }),
      unsaved: meme(null),
      'upload-with-ref': null,
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
    post('socialPost.6f1c2a9e-4b3d-4e21-9a55-0d7e8c1b2a01', 'conf-a-2026', [
      PNG('a'),
    ]),
    variant(
      'socialPostVariant.2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d06',
      'conf-a-2026',
      'socialPost.6f1c2a9e-4b3d-4e21-9a55-0d7e8c1b2a01',
    ),
    // A Studio draft of another Task on the same post, FIRST in the dataset:
    // it must never be the post's subject.
    task(
      'drafts.marketingTask.1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f08',
      'conf-a-2026',
      'socialPostVariant.2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d06',
      'sponsor-1',
    ),
    task(
      'marketingTask.7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e07',
      'conf-a-2026',
      'socialPostVariant.2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d06',
      'sp-ada',
    ),
    // A Task of ANOTHER conference pointing at our post names no subject.
    task(
      'marketingTask.gen-4f3e2d1c0b9a',
      'conf-b',
      'socialPostVariant.2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d06',
      'sponsor-1',
    ),
    post('socialPost.0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c02', 'conf-a-2026', []),
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
    expect(
      await pick('socialPost.6f1c2a9e-4b3d-4e21-9a55-0d7e8c1b2a01', {
        editions: 'all',
      }),
    ).toEqual([
      'ada-org',
      'ada-2025',
      'card-2026',
      'party-gif',
      'logo',
      'old-2025',
    ])
  })

  it('without a subject: this edition, then the organization; older editions only on request', async () => {
    expect(
      await pick('socialPost.0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c02'),
    ).toEqual(['card-2026', 'party-gif', 'logo', 'ada-org'])
  })

  it('searches within the same order', async () => {
    h.dataset = PICKER.map((d) =>
      d._id === 'ada-2025' || d._id === 'logo'
        ? { ...d, tags: ['keynote'] }
        : d,
    )
    expect(
      await pick('socialPost.6f1c2a9e-4b3d-4e21-9a55-0d7e8c1b2a01', {
        search: 'keyn',
        editions: 'all',
      }),
    ).toEqual(['ada-2025', 'logo'])
  })

  it('never scans the posts for usage: the picker does not show it', async () => {
    const rows = await listMarketingAssetsForPost(
      'org-a',
      'conf-a-2026',
      'socialPost.6f1c2a9e-4b3d-4e21-9a55-0d7e8c1b2a01',
      { editions: 'all' },
    )
    expect(h.queries.some((q) => q.includes('"socialPost"'))).toBe(false)
    expect(rows.every((row) => row.usedInPosts === null)).toBe(true)
  })

  it('marks a GIF as not attachable, and never lists a track', async () => {
    const rows = await listMarketingAssetsForPost(
      'org-a',
      'conf-a-2026',
      'socialPost.0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c02',
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
      post('socialPost.3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e03', 'conf-a-2025', [
        PNG('a'),
        PNG('b'),
      ]),
      // Another tenant's post holding the same bytes, and a Studio draft.
      post('socialPost.9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c04', 'conf-b', [
        PNG('a'),
      ]),
      post(
        'drafts.socialPost.6f1c2a9e-4b3d-4e21-9a55-0d7e8c1b2a01',
        'conf-a-2026',
        [PNG('a')],
      ),
      // A Content Release copy is not a second post either.
      post(
        'versions.r-launch.socialPost.6f1c2a9e-4b3d-4e21-9a55-0d7e8c1b2a01',
        'conf-a-2026',
        [PNG('a')],
      ),
      // The same image twice in one post is one post.
      post('socialPost.5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c05', 'conf-a-2026', [
        PNG('d'),
        PNG('d'),
      ]),
    ]
    const rows = await listMarketingAssets(
      'org-a',
      'conf-a-2026',
      {
        editions: 'all',
      },
      { countUsage: true },
    )
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

  describe("the post Channel's Format first (#1249)", () => {
    const POST = 'socialPost.6f1c2a9e-4b3d-4e21-9a55-0d7e8c1b2a01'
    const OTHER_POST = 'socialPost.0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c02'
    const V = {
      linkedin: 'socialPostVariant.11111111-1111-4111-8111-111111111111',
      bluesky: 'socialPostVariant.22222222-2222-4222-8222-222222222222',
      x: 'socialPostVariant.33333333-3333-4333-8333-333333333333',
      foreign: 'socialPostVariant.44444444-4444-4444-8444-444444444444',
      otherPost: 'socialPostVariant.55555555-5555-4555-8555-555555555555',
    }
    const imageId = (n: string, width: number, height: number) =>
      `image-${n.repeat(40)}-${width}x${height}-png`
    const sized = (n: string, width: number, height: number) => ({
      ...img(imageId(n, width, height)),
      metadata: { dimensions: { width, height } },
    })
    const imageAt = (n: string, width: number, height: number) =>
      imageOf(imageId(n, width, height))
    const studio = (tab: string, format?: string) => ({
      source: 'studio',
      studio: { tab, ...(format ? { format } : {}) },
    })
    const at = (day: string) => ({ _createdAt: `2026-09-${day}T00:00:00Z` })
    const thisEdition = { scope: 'edition', conference: ref('conf-a-2026') }
    const platformVariant = (
      id: string,
      conf: string,
      postId: string,
      platform: string,
    ) => ({ ...variant(id, conf, postId), platform })

    const RANKED = [
      ...DATASET.filter((d) => d._type !== 'marketingAsset'),
      sized('1', 1080, 1080),
      sized('2', 1200, 628),
      sized('3', 1920, 1080),
      sized('4', 1080, 1350),
      sized('5', 1600, 900),
      img('image-nodims'),
      // About the post's subject: this group leads whatever its Format.
      asset('ada-square', 'org-a', {
        ...imageAt('1', 1080, 1080),
        subject: weak('sp-ada'),
        ...at('10'),
      }),
      asset('ada-landscape', 'org-a', {
        ...imageAt('2', 1200, 628),
        ...studio('speakers', 'landscape'),
        subject: weak('sp-ada'),
        ...at('01'),
      }),
      // This edition's. A studio card saved before Formats existed reads as
      // square, whatever shape its pixels are (spec §6).
      asset('ed-old-sponsor', 'org-a', {
        ...imageAt('3', 1920, 1080),
        ...studio('sponsors'),
        ...thisEdition,
        ...at('09'),
      }),
      // Uploads have no Format: their shape ranks them.
      asset('ed-tall', 'org-a', {
        ...imageAt('4', 1080, 1350),
        ...thisEdition,
        ...at('08'),
      }),
      asset('ed-wide', 'org-a', {
        ...imageAt('5', 1600, 900),
        ...thisEdition,
        ...at('07'),
      }),
      asset('ed-square', 'org-a', {
        ...imageAt('1', 1080, 1080),
        ...thisEdition,
        ...at('06'),
      }),
      // The organization's: an upload of unknown size reads as square.
      asset('org-no-size', 'org-a', {
        ...imageOf('image-nodims'),
        ...at('05'),
      }),
      asset('org-landscape', 'org-a', {
        ...imageAt('2', 1200, 628),
        ...studio('sponsors', 'landscape'),
        ...at('04'),
      }),
      post(POST, 'conf-a-2026', []),
      post(OTHER_POST, 'conf-a-2026', []),
      platformVariant(V.linkedin, 'conf-a-2026', POST, 'linkedin'),
      platformVariant(V.bluesky, 'conf-a-2026', POST, 'bluesky'),
      platformVariant(V.x, 'conf-a-2026', POST, 'x'),
      // Another conference's LinkedIn variant naming our post, and a LinkedIn
      // variant of our OTHER post: neither is this post's Channel.
      platformVariant(V.foreign, 'conf-b', POST, 'linkedin'),
      platformVariant(V.otherPost, 'conf-a-2026', OTHER_POST, 'linkedin'),
      task(
        'marketingTask.9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c66',
        'conf-a-2026',
        V.linkedin,
        'sp-ada',
      ),
    ]

    beforeEach(() => {
      h.dataset = RANKED
    })

    const UNRANKED = [
      'ada-square',
      'ada-landscape',
      'ed-old-sponsor',
      'ed-tall',
      'ed-wide',
      'ed-square',
      'org-no-size',
      'org-landscape',
    ]

    it('a LinkedIn post: the landscape entries lead each group, subject first', async () => {
      expect(await pick(POST, { variantId: V.linkedin })).toEqual([
        'ada-landscape',
        'ada-square',
        'ed-wide',
        'ed-old-sponsor',
        'ed-tall',
        'ed-square',
        'org-landscape',
        'org-no-size',
      ])
    })

    it('a Bluesky post: the square entries lead each group, subject first', async () => {
      expect(await pick(POST, { variantId: V.bluesky })).toEqual([
        'ada-square',
        'ada-landscape',
        'ed-old-sponsor',
        'ed-square',
        'ed-tall',
        'ed-wide',
        'org-no-size',
        'org-landscape',
      ])
    })

    it('an upload ranks by the shape it is POSTED at: a 2:1 image cropped to a square is square', async () => {
      h.dataset = [
        ...RANKED,
        // 2000×1000 with a quarter trimmed from each side: 1000×1000 is what
        // `defaultCropRect` starts from, so LinkedIn crops it like a square.
        asset('ed-cropped', 'org-a', {
          image: {
            _type: 'image',
            asset: ref(imageId('6', 2000, 1000)),
            crop: {
              _type: 'sanity.imageCrop',
              top: 0,
              bottom: 0,
              left: 0.25,
              right: 0.25,
            },
          },
          ...thisEdition,
          ...at('11'),
        }),
        sized('6', 2000, 1000),
      ]
      const rows = await listMarketingAssetsForPost(
        'org-a',
        'conf-a-2026',
        POST,
        { variantId: V.linkedin },
      )
      expect(ids(rows)).toEqual([
        'ada-landscape',
        'ada-square',
        'ed-wide',
        'ed-cropped',
        'ed-old-sponsor',
        'ed-tall',
        'ed-square',
        'org-landscape',
        'org-no-size',
      ])
      const cropped = rows.find((r) => r._id === 'ed-cropped')
      expect(cropped?.format).toBe('square')
      // The crop travels to the editor, which warns from the same shape.
      expect(cropped?.crop).toEqual({
        top: 0,
        bottom: 0,
        left: 0.25,
        right: 0.25,
      })
      // Never a field taken away: the row still reports the original pixels.
      expect([cropped?.width, cropped?.height]).toEqual([2000, 1000])
    })

    it('a 4:1 banner and a 3:2 photo rank as landscape (the nearest Format); the editor warns about their crop', async () => {
      h.dataset = [
        ...RANKED,
        sized('7', 4000, 1000),
        sized('8', 1500, 1000),
        asset('ed-banner', 'org-a', {
          ...imageAt('7', 4000, 1000),
          ...thisEdition,
          ...at('12'),
        }),
        asset('ed-photo', 'org-a', {
          ...imageAt('8', 1500, 1000),
          ...thisEdition,
          ...at('11'),
        }),
      ]
      const rows = await listMarketingAssetsForPost(
        'org-a',
        'conf-a-2026',
        POST,
        { variantId: V.linkedin },
      )
      expect(ids(rows)).toEqual([
        'ada-landscape',
        'ada-square',
        'ed-banner',
        'ed-photo',
        'ed-wide',
        'ed-old-sponsor',
        'ed-tall',
        'ed-square',
        'org-landscape',
        'org-no-size',
      ])
      const [banner, photo] = ['ed-banner', 'ed-photo'].map((id) =>
        rows.find((r) => r._id === id),
      )
      expect([banner?.format, photo?.format]).toEqual([
        'landscape',
        'landscape',
      ])
      // What the editor makes of the same rows: ranked first, still warned.
      const warn = (row: (typeof rows)[number] | undefined) =>
        row &&
        formatMismatchWarning('linkedin', {
          format: row.format,
          size: croppedSize(row),
          studio: Boolean(row.studio),
        })
      expect(warn(banner)).toContain('loses about 52% of its width (sides)')
      expect(warn(photo)).toContain(
        'loses about 21% of its height (top and bottom)',
      )
      expect(warn(rows.find((r) => r._id === 'ed-wide'))).toBeNull()
    })

    it('sends each entry its Format: the recorded one, square for a studio card without one, the shape of an upload', async () => {
      const rows = await listMarketingAssetsForPost(
        'org-a',
        'conf-a-2026',
        POST,
        { variantId: V.linkedin },
      )
      expect(Object.fromEntries(rows.map((r) => [r._id, r.format]))).toEqual({
        'ada-square': 'square',
        'ada-landscape': 'landscape',
        'ed-old-sponsor': 'square',
        'ed-tall': 'portrait',
        'ed-wide': 'landscape',
        'ed-square': 'square',
        'org-no-size': 'square',
        'org-landscape': 'landscape',
      })
    })

    it("no variant, a Channel with no native Format, or a variant that is not this post's: the order is unchanged", async () => {
      expect(await pick(POST)).toEqual(UNRANKED)
      expect(await pick(POST, { variantId: V.x })).toEqual(UNRANKED)
      // Scoped to this conference: another conference's variant reads as none.
      expect(await pick(POST, { variantId: V.foreign })).toEqual(UNRANKED)
      expect(await pick(POST, { variantId: V.otherPost })).toEqual(UNRANKED)
    })
  })
})

describe('GIFs and videos (#1167)', () => {
  const MOTION = [
    {
      _id: 'file-clip-mp4',
      _type: 'sanity.fileAsset',
      url: 'https://cdn.sanity.io/files/p/d/clip.mp4',
    },
    {
      _id: 'image-poster-1920x1080-jpg',
      _type: 'sanity.imageAsset',
      url: 'https://cdn.sanity.io/images/p/d/poster-1920x1080.jpg',
      mimeType: 'image/jpeg',
      metadata: { dimensions: { width: 1920, height: 1080 } },
    },
    {
      _id: 'image-wave-480x480-gif',
      _type: 'sanity.imageAsset',
      url: 'https://cdn.sanity.io/images/p/d/wave-480x480.gif',
      mimeType: 'image/gif',
      metadata: { dimensions: { width: 480, height: 480 } },
    },
    asset('clip', 'org-a', {
      kind: 'video',
      title: 'Opening, 20 s',
      video: { _type: 'file', asset: ref('file-clip-mp4') },
      poster: { _type: 'image', asset: ref('image-poster-1920x1080-jpg') },
      createdFileAssetId: 'file-clip-mp4',
      // The poster Sanity already held: not ours to delete.
      _createdAt: '2026-09-06T00:00:00Z',
    }),
    asset('wave', 'org-a', {
      kind: 'gif',
      title: 'Wave!',
      image: { _type: 'image', asset: ref('image-wave-480x480-gif') },
      createdImageAssetId: 'image-wave-480x480-gif',
      _createdAt: '2026-09-07T00:00:00Z',
    }),
    // B's video, on the same bytes.
    asset('b-clip', 'org-b', {
      kind: 'video',
      video: { _type: 'file', asset: ref('file-clip-mp4') },
    }),
  ]
  beforeEach(() => {
    h.dataset = [...DATASET, ...MOTION]
  })

  it('lists each by its kind, within this organization', async () => {
    expect(await list({ kind: 'video' })).toEqual(['clip'])
    expect(await list({ kind: 'gif' })).toEqual(['wave'])
  })

  it('carries a video’s file, poster and original download; never attachable', async () => {
    const [video] = await listMarketingAssets('org-a', 'conf-a-2026', {
      kind: 'video',
    })
    expect(video).toMatchObject({
      kind: 'video',
      alt: 'alt of clip',
      videoUrl: 'https://cdn.sanity.io/files/p/d/clip.mp4',
      posterUrl: 'https://cdn.sanity.io/images/p/d/poster-1920x1080.jpg',
      posterAssetId: 'image-poster-1920x1080-jpg',
      width: 1920,
      height: 1080,
      imageUrl: null,
      assetId: null,
      attachable: false,
      // The file endpoint's `dl` keeps the bytes; it only adds the header.
      downloadUrl:
        'https://cdn.sanity.io/files/p/d/clip.mp4?dl=opening-20-s.mp4',
    })
  })

  it('downloads a GIF through our route, never a CDN rendition', async () => {
    const [gif] = await listMarketingAssets('org-a', 'conf-a-2026', {
      kind: 'gif',
    })
    expect(gif).toMatchObject({
      kind: 'gif',
      imageUrl: 'https://cdn.sanity.io/images/p/d/wave-480x480.gif',
      attachable: false,
      downloadUrl: '/api/admin/marketing-assets/original?asset=wave',
      videoUrl: null,
    })
  })

  it('reads a video’s MP4 AND poster for delete, each with its own provenance', async () => {
    expect(await readMarketingAssetMedia('org-a', 'clip')).toEqual({
      kind: 'video',
      files: [
        {
          assetId: 'image-poster-1920x1080-jpg',
          type: 'image',
          createdByUpload: false,
        },
        { assetId: 'file-clip-mp4', type: 'file', createdByUpload: true },
      ],
    })
    expect(await readMarketingAssetMedia('org-a', 'wave')).toEqual({
      kind: 'gif',
      files: [
        {
          assetId: 'image-wave-480x480-gif',
          type: 'image',
          createdByUpload: true,
        },
      ],
    })
    expect(await readMarketingAssetMedia('org-a', 'b-clip')).toBeNull()
  })

  it('reads a GIF for its original route, and nothing else', async () => {
    expect(await readMarketingAssetGif('org-a', 'wave')).toEqual({
      title: 'Wave!',
      url: 'https://cdn.sanity.io/images/p/d/wave-480x480.gif',
    })
    expect(await readMarketingAssetGif('org-a', 'clip')).toBeNull()
    expect(await readMarketingAssetGif('org-b', 'wave')).toBeNull()
  })

  it('reads neither as attachable when a post takes it, whatever its bytes', async () => {
    expect(await readMarketingAssetForPost('org-a', 'clip')).toMatchObject({
      imageAssetId: null,
      attachable: false,
    })
    expect(await readMarketingAssetForPost('org-a', 'wave')).toMatchObject({
      imageAssetId: 'image-wave-480x480-gif',
      attachable: false,
    })
    // Refused by its KIND, even were its asset id and type to say "still".
    h.dataset.push({
      _id: 'image-still-1x1-png',
      _type: 'sanity.imageAsset',
      mimeType: 'image/png',
    })
    h.dataset.push(
      asset('odd-gif', 'org-a', {
        kind: 'gif',
        image: { _type: 'image', asset: ref('image-still-1x1-png') },
      }),
    )
    expect(await readMarketingAssetForPost('org-a', 'odd-gif')).toMatchObject({
      attachable: false,
    })
  })

  it('offers both in the post picker, marked not attachable', async () => {
    h.dataset.push({
      _id: 'post-1',
      _type: 'socialPost',
      conference: ref('conf-a-2026'),
    })
    const rows = await listMarketingAssetsForPost(
      'org-a',
      'conf-a-2026',
      'post-1',
      {},
    )
    const motion = rows.filter((r) => r.kind === 'gif' || r.kind === 'video')
    expect(motion.map((r) => [r._id, r.attachable])).toEqual([
      ['wave', false],
      ['clip', false],
    ])
    // The manual view asks for only these, filtered on the server.
    const byHand = await listMarketingAssetsForPost(
      'org-a',
      'conf-a-2026',
      'post-1',
      { byHand: true },
    )
    expect(byHand.map((r) => r._id)).toEqual(['wave', 'clip'])
  })
})
