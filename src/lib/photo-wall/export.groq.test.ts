/**
 * @vitest-environment node
 *
 * The consented ZIP export's read (Photo Wall spec §12, §13 P5): its GROQ
 * EXECUTED with groq-js over a two-tenant fixture.
 *
 * Adversarial fixture: ANOTHER conference's approved, consented post (whose
 * id and caption name this conference, so a dropped tenant predicate can't be
 * masked by an id match), and this conference's pending, Not shown,
 * `deleting` and non-consented posts, a draft, and a document of another type
 * with the same fields. Each would land in the ZIP if it counted.
 */
import { evaluate, parse } from 'groq-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  clientReadCached: {
    fetch: async () => {
      throw new Error('consent is read live, never from the CDN client')
    },
  },
  clientWrite: {},
}))

import {
  countConsentedPhotos,
  readConsentedPhotos,
  stillExportable,
} from './export'

const CDN = 'https://cdn.sanity.io/images/proj/production'

const asset = (sha: string) => ({
  _id: `image-${sha}-800x600-jpg`,
  _type: 'sanity.imageAsset',
  url: `${CDN}/${sha}-800x600.jpg`,
})

const post = (
  uploadId: string,
  conference: string,
  fields: Record<string, unknown>,
  _type = 'wallPost',
) => ({
  _id: `${_type}-${uploadId}`,
  _type,
  conference: { _type: 'reference', _ref: conference },
  photo: {
    _type: 'image',
    asset: { _type: 'reference', _ref: `image-${uploadId}-800x600-jpg` },
  },
  status: 'approved',
  marketingConsent: true,
  submittedAt: '2026-10-26T09:00:00.000Z',
  approvedAt: '2026-10-26T10:00:00.000Z',
  ...fields,
})

beforeEach(() => {
  h.queries.length = 0
  h.dataset = [
    ...['a1', 'a2', 'b1', 'p1', 'n1', 'x1', 'd1', 'f1', 'r1', 'conf-A'].map(
      asset,
    ),
    // Exported: approved and consented, on this wall. a2 approved later.
    post('a1', 'conf-A', {}),
    post('a2', 'conf-A', {
      submittedAt: '2026-10-26T09:30:00.000Z',
      approvedAt: '2026-10-26T11:00:00.000Z',
    }),
    // ANOTHER conference's approved and consented post, its id and caption
    // naming this one.
    post('conf-A', 'conf-B', { caption: 'conf-A' }),
    post('b1', 'conf-B', {}),
    // This wall, not exported.
    post('p1', 'conf-A', { status: 'pending' }),
    post('n1', 'conf-A', { status: 'notShown' }),
    post('x1', 'conf-A', { marketingConsent: false }),
    post('r1', 'conf-A', { marketingConsent: null }),
    post('d1', 'conf-A', { status: 'deleting', photo: null }),
    { ...post('f1', 'conf-A', {}), _id: 'drafts.wallPost-f1' },
    post('a1', 'conf-A', {}, 'feedbackResponse'),
  ]
})

describe('readConsentedPhotos', () => {
  it('returns this wall’s approved, consented posts only, newest approval first', async () => {
    expect(await readConsentedPhotos('conf-A')).toEqual([
      {
        _id: 'wallPost-a2',
        url: `${CDN}/a2-800x600.jpg`,
        submittedAt: '2026-10-26T09:30:00.000Z',
      },
      {
        _id: 'wallPost-a1',
        url: `${CDN}/a1-800x600.jpg`,
        submittedAt: '2026-10-26T09:00:00.000Z',
      },
    ])
  })

  it('returns the other conference’s post when asked for that conference', async () => {
    const ids = (await readConsentedPhotos('conf-B')).map((p) => p._id)
    expect(ids.sort()).toEqual(['wallPost-b1', 'wallPost-conf-A'])
  })

  it('skips an approved, consented post whose photo is gone', async () => {
    h.dataset.push(post('gone', 'conf-A', {}))
    const ids = (await readConsentedPhotos('conf-A')).map((p) => p._id)
    expect(ids).toEqual(['wallPost-a2', 'wallPost-a1'])
  })

  it('reads in ONE query, on the non-CDN client', async () => {
    await readConsentedPhotos('conf-A')
    expect(h.queries).toHaveLength(1)
  })
})

describe('countConsentedPhotos: the same rule as the ZIP', () => {
  it('counts this wall’s exportable posts, a photo-less one not', async () => {
    h.dataset.push(post('gone', 'conf-A', {}))
    expect(await countConsentedPhotos('conf-A')).toBe(2)
    expect(await countConsentedPhotos('conf-B')).toBe(2)
    expect(await countConsentedPhotos('conf-C')).toBe(0)
  })
})

describe('stillExportable: the re-check before each photo', () => {
  it('keeps only ids that are still this wall’s exportable posts', async () => {
    h.dataset.push(post('gone', 'conf-A', {}))
    const live = await stillExportable('conf-A', [
      'wallPost-a1',
      'wallPost-a2',
      // Pending, Not shown, unticked, photo gone, a draft.
      'wallPost-p1',
      'wallPost-n1',
      'wallPost-x1',
      'wallPost-gone',
      'drafts.wallPost-f1',
      // Deleted since the list was read.
      'wallPost-deleted',
      // Another conference's approved, consented post, its id naming conf-A.
      'wallPost-conf-A',
    ])
    expect([...live].sort()).toEqual(['wallPost-a1', 'wallPost-a2'])
  })

  it('answers for the ids asked about only', async () => {
    expect([...(await stillExportable('conf-A', ['wallPost-a1']))]).toEqual([
      'wallPost-a1',
    ])
  })

  it('sees a consent unticked since the list was read', async () => {
    const listed = (await readConsentedPhotos('conf-A')).map((p) => p._id)
    const a1 = h.dataset.find((d) => d._id === 'wallPost-a1')!
    a1.marketingConsent = false
    expect([...(await stillExportable('conf-A', listed))]).toEqual([
      'wallPost-a2',
    ])
  })
})
