/**
 * @vitest-environment node
 *
 * My posts' read (Photo Wall spec §8, §12): its GROQ EXECUTED with groq-js
 * over a two-tenant fixture.
 *
 * Adversarial fixture: ANOTHER device's post on this wall, THIS device's
 * post on another conference's wall, a draft of this device's post, and a
 * document of another type with the same fields. Each would be listed as
 * one of this phone's posts if it counted.
 */
import { evaluate, parse } from 'groq-js'
// The REAL builder by its path: `vitest.config.ts` aliases `@sanity/image-url`
// to a mock that answers one fixed URL, and the `rect=` square is the point.
import { createImageUrlBuilder } from '../../../node_modules/@sanity/image-url/lib/index.js'
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
      throw new Error('My posts is read live, never from the CDN client')
    },
  },
  clientWrite: {},
  sanityImage: (source: string) =>
    createImageUrlBuilder({ projectId: 'proj', dataset: 'production' }).image(
      source,
    ),
}))

import { readMyPosts } from './my-posts-read'

const CDN = 'https://cdn.sanity.io/images/proj/production'
const DEVICE = 'd1'.padEnd(32, '0')
const OTHER_DEVICE = 'd2'.padEnd(32, '0')

const asset = (sha: string, width = 1600, height = 1000) => ({
  _id: `image-${sha}-${width}x${height}-jpg`,
  _type: 'sanity.imageAsset',
  url: `${CDN}/${sha}-${width}x${height}.jpg`,
  metadata: { dimensions: { width, height } },
})

const post = (
  uploadId: string,
  conference: string,
  deviceKey: string,
  fields: Record<string, unknown> = {},
  _type = 'wallPost',
) => ({
  _id: `${_type}-${uploadId}`,
  _type,
  _createdAt: '2026-10-26T09:00:00.000Z',
  conference: { _type: 'reference', _ref: conference },
  deviceKey,
  photo: {
    _type: 'image',
    asset: { _type: 'reference', _ref: `image-${uploadId}-1600x1000-jpg` },
  },
  crop: { x: 0.25, y: 0.5 },
  status: 'pending',
  caption: 'Keynote',
  name: 'Ada',
  marketingConsent: false,
  submittedAt: '2026-10-26T09:00:00.000Z',
  ...fields,
})

beforeEach(() => {
  h.queries.length = 0
  h.dataset = [
    asset('aaa'),
    asset('bbb', 1000, 1600),
    asset('ccc'),
    asset('ddd'),
    asset('eee'),
    asset('fff'),
    asset('ggg'),
    post('aaa', 'conf-A', DEVICE, { submittedAt: '2026-10-26T09:00:00Z' }),
    post('bbb', 'conf-A', DEVICE, {
      photo: {
        _type: 'image',
        asset: { _type: 'reference', _ref: 'image-bbb-1000x1600-jpg' },
      },
      status: 'approved',
      marketingConsent: true,
      submittedAt: '2026-10-26T10:00:00Z',
      approvedAt: '2026-10-26T10:05:00Z',
      caption: null,
      name: null,
    }),
    post('ccc', 'conf-A', DEVICE, {
      status: 'notShown',
      submittedAt: '2026-10-26T08:00:00Z',
    }),
    // A Delete that did not finish: no photo any more.
    post('ddd', 'conf-A', DEVICE, {
      status: 'deleting',
      photo: undefined,
      deletingAssetId: 'image-ddd-1600x1000-jpg',
      submittedAt: '2026-10-26T07:00:00Z',
    }),
    // Another device on this wall.
    post('eee', 'conf-A', OTHER_DEVICE),
    // This device on ANOTHER conference's wall.
    post('fff', 'conf-B', DEVICE),
    // A draft of this device's post, and another type with the same fields.
    { ...post('aaa', 'conf-A', DEVICE), _id: 'drafts.wallPost-aaa' },
    post('ggg', 'conf-A', DEVICE, {}, 'feedbackResponse'),
  ]
})

describe('readMyPosts', () => {
  it("lists this device's posts on this wall only, newest submission first", async () => {
    const posts = await readMyPosts('conf-A', DEVICE)
    expect(posts.map((p) => p._id)).toEqual([
      'wallPost-bbb',
      'wallPost-aaa',
      'wallPost-ccc',
      'wallPost-ddd',
    ])
  })

  it('carries each post as the card shows it: status, the square as a Sanity URL, caption, name and the marketing consent', async () => {
    const [approved, pending] = await readMyPosts('conf-A', DEVICE)
    expect(pending).toEqual({
      _id: 'wallPost-aaa',
      status: 'pending',
      // 1600x1000 at x=0.25: the 1000 px square starts at 150 px.
      src: `${CDN}/aaa-1600x1000.jpg?rect=150,0,1000,1000&w=600&h=600&auto=format`,
      caption: 'Keynote',
      name: 'Ada',
      marketingConsent: false,
      submittedAt: '2026-10-26T09:00:00Z',
      incarnation: {
        createdAt: '2026-10-26T09:00:00.000Z',
        assetId: 'image-aaa-1600x1000-jpg',
      },
    })
    expect(approved).toMatchObject({
      _id: 'wallPost-bbb',
      status: 'approved',
      // Portrait: the square is cut along the height.
      src: `${CDN}/bbb-1000x1600.jpg?rect=0,300,1000,1000&w=600&h=600&auto=format`,
      caption: null,
      name: null,
      marketingConsent: true,
    })
  })

  it('shows no photo for a deleting post, and hides the asset it still has to remove', async () => {
    const posts = await readMyPosts('conf-A', DEVICE)
    expect(posts[3]).toEqual({
      _id: 'wallPost-ddd',
      status: 'deleting',
      src: null,
      caption: 'Keynote',
      name: 'Ada',
      marketingConsent: false,
      submittedAt: '2026-10-26T07:00:00Z',
      incarnation: { createdAt: '2026-10-26T09:00:00.000Z', assetId: null },
    })
  })

  it("sees this device's post on the other conference when asked for that conference", async () => {
    const posts = await readMyPosts('conf-B', DEVICE)
    expect(posts.map((p) => p._id)).toEqual(['wallPost-fff'])
  })

  it('is empty for an unknown device and for a wall it never posted on', async () => {
    expect(await readMyPosts('conf-A', 'nobody')).toEqual([])
    expect(await readMyPosts('conf-C', DEVICE)).toEqual([])
  })

  it('binds the device key as a query parameter, never spliced into the query text', async () => {
    await readMyPosts('conf-A', `${DEVICE}" || true || "`)
    expect(h.queries).toHaveLength(1)
    expect(h.queries[0]).not.toContain(DEVICE)
  })
})
