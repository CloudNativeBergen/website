/**
 * @vitest-environment node
 *
 * The public `wall` router (Photo Wall spec §8, §9.1) through the tRPC
 * caller, with no session, on the versioned in-memory store: GROQ is
 * EXECUTED with groq-js and the photo URLs come from the REAL
 * `@sanity/image-url`. Only the cache directives are replaced.
 *
 * Adversarial fixture: another conference's approved posts sit next to this
 * one's, one of them with THIS conference's id in its `_id` and caption, so a
 * dropped tenant predicate can't be masked by an id match.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  cacheLife: h.cacheLife,
  cacheTag: h.cacheTag,
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  // The REAL URL builder, past the suite-wide alias: the square is what the
  // installed library makes of `rect=`, not a mock's canned string.
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const { createImageUrlBuilder } = (await import(
    pathToFileURL(createRequire(import.meta.url).resolve('@sanity/image-url'))
      .href
  )) as typeof import('@sanity/image-url')
  h.store = createVersionedSanityStore()
  const builder = createImageUrlBuilder({ projectId: 'test', dataset: 'test' })
  return {
    ...h.store.clients,
    sanityImage: (source: Parameters<typeof builder.image>[0]) =>
      builder.image(source),
  }
})
const CONFERENCE = {
  _id: 'conf-A',
  title: 'CND 2026',
  organization: { _ref: 'org-A' },
  startDate: '2026-10-26',
  endDate: '2026-10-27',
  domains: ['2026.example.no'],
}
const tenant = vi.hoisted(() => ({
  conference: null as null | Record<string, unknown>,
  error: null as null | Error,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () =>
    tenant.error
      ? { conference: null, error: tenant.error }
      : { conference: { ...CONFERENCE, ...tenant.conference }, error: null },
  ),
}))

import { initTRPC } from '@trpc/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { Context } from '@/server/trpc'
import { wallRouter } from './wall'

type Doc = Record<string, unknown> & { _id: string }
const store = () => h.store!

const t = initTRPC.context<Context>().create()
/** An anonymous visitor: the Wall page has no sign-in. */
const visitor = () =>
  t.createCallerFactory(wallRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: null,
    speaker: null,
    user: null,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const wallOf = (conferenceId: string, fields: Record<string, unknown> = {}) =>
  ({
    _id: `photoWall-${conferenceId}`,
    _type: 'photoWall',
    _rev: `rev-${conferenceId}`,
    conference: ref(conferenceId),
    postingMode: 'open',
    ...fields,
  }) as Doc

/** An approved Wall Post (§4.2) with its photo on `asset`. */
const postOf = (
  conferenceId: string,
  uploadId: string,
  fields: Record<string, unknown> = {},
) =>
  ({
    _id: `wallPost-${uploadId}`,
    _type: 'wallPost',
    _rev: `rev-${uploadId}`,
    conference: ref(conferenceId),
    status: 'approved',
    photo: {
      _type: 'image',
      asset: ref(`image-sha${uploadId}-1600x1000-jpg`),
    },
    crop: { x: 0.5, y: 0.5 },
    marketingConsent: true,
    deviceKey: 'device-hash',
    submittedAt: '2026-10-26T07:30:00Z',
    approvedAt: '2026-10-26T07:40:00Z',
    decidedAt: '2026-10-26T07:40:00Z',
    ...fields,
  }) as Doc

/** The post and the `sanity.imageAsset` its photo references. */
const withPhoto = (post: Doc, width = 1600, height = 1000): Doc[] => {
  const asset = (post.photo as { asset: { _ref: string } } | undefined)?.asset
  if (!asset) return [post]
  const sha = asset._ref.replace(/^image-/, '').replace(/-\d+x\d+-\w+$/, '')
  return [
    post,
    {
      _id: asset._ref,
      _type: 'sanity.imageAsset',
      url: `https://cdn.sanity.io/images/test/test/${sha}-${width}x${height}.jpg`,
      metadata: { dimensions: { width, height, aspectRatio: width / height } },
    },
  ]
}

/** Minutes after 07:00Z on the first day, as an ISO time. */
const at = (minutes: number) =>
  new Date(Date.parse('2026-10-26T07:00:00Z') + minutes * 60_000).toISOString()

beforeEach(() => {
  tenant.conference = null
  tenant.error = null
  vi.mocked(getConferenceForCurrentDomain).mockClear()
  store().reset()
  h.cacheTag.mockClear()
  h.cacheLife.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-26T08:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('wall.get (§8, §9.1)', () => {
  it('answers an approved post with its square photo, caption and name, and nothing private', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(
        postOf('conf-A', 'a1', {
          caption: 'Keynote crowd',
          name: 'Ada',
          crop: { x: 0.2, y: 0.5 },
        }),
      ),
    ])
    await expect(visitor().get()).resolves.toEqual({
      closed: false,
      postingOpen: true,
      sponsorStrip: false,
      posts: [
        {
          _id: 'wallPost-a1',
          // The short-edge square (1000 px) 20% of the way along the
          // 600 px of slack: x = 120. About 600 px wide on a phone (§5.1).
          src: 'https://cdn.sanity.io/images/test/test/shaa1-1600x1000.jpg?rect=120,0,1000,1000&w=600&h=600&auto=format',
          crop: { x: 0.2, y: 0.5 },
          caption: 'Keynote crowd',
          name: 'Ada',
          approvedAt: '2026-10-26T07:40:00Z',
        },
      ],
    })
  })

  it('places the square on a portrait photo along its height', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(
        postOf('conf-A', 'p1', { crop: { x: 0.5, y: 1 } }),
        1200,
        1600,
      ),
    ])
    const { posts } = await visitor().get()
    expect(posts[0].src).toBe(
      'https://cdn.sanity.io/images/test/test/shap1-1200x1600.jpg?rect=0,400,1200,1200&w=600&h=600&auto=format',
    )
  })

  it('centres a post stored without a crop (§4.2)', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'c1', { crop: undefined })),
    ])
    const { posts } = await visitor().get()
    expect(posts[0].crop).toEqual({ x: 0.5, y: 0.5 })
    expect(posts[0].src).toContain('rect=300,0,1000,1000')
  })

  it('answers approved posts only: never pending, Not shown, deleting or a draft', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'ok')),
      ...withPhoto(postOf('conf-A', 'p', { status: 'pending' })),
      ...withPhoto(postOf('conf-A', 'n', { status: 'notShown' })),
      ...withPhoto(postOf('conf-A', 'd', { status: 'deleting' })),
      { ...postOf('conf-A', 'dr'), _id: 'drafts.wallPost-dr' },
      // A draft of the approved post must not replace it.
      {
        ...postOf('conf-A', 'ok', { caption: 'Draft' }),
        _id: 'drafts.wallPost-ok',
      },
    ])
    const { posts } = await visitor().get()
    expect(posts.map((p) => [p._id, p.caption])).toEqual([
      ['wallPost-ok', null],
    ])
  })

  it("never answers another conference's post, even one named after this conference", async () => {
    store().reset([
      wallOf('conf-A'),
      wallOf('conf-B'),
      ...withPhoto(postOf('conf-A', 'a1', { approvedAt: at(1) })),
      // Newer, approved, and carrying conf-A in its id and caption: only the
      // tenant predicate keeps it out.
      ...withPhoto(
        postOf('conf-B', 'conf-A-b1', {
          approvedAt: at(30),
          caption: 'conf-A',
        }),
      ),
      ...withPhoto(postOf('conf-B', 'b2', { approvedAt: at(31) })),
    ])
    const { posts } = await visitor().get()
    expect(posts.map((p) => p._id)).toEqual(['wallPost-a1'])
  })

  it('orders by approval, newest first, not by submission', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(
        postOf('conf-A', 'old', { approvedAt: at(5), submittedAt: at(-1) }),
      ),
      ...withPhoto(
        postOf('conf-A', 'new', { approvedAt: at(20), submittedAt: at(-30) }),
      ),
      // Submitted last, approved in between (a re-approval from Not shown).
      ...withPhoto(
        postOf('conf-A', 'mid', { approvedAt: at(10), submittedAt: at(0) }),
      ),
    ])
    const { posts } = await visitor().get()
    expect(posts.map((p) => p._id)).toEqual([
      'wallPost-new',
      'wallPost-mid',
      'wallPost-old',
    ])
  })

  it('answers at most the 200 newest approvals; the oldest leave (§9.1)', async () => {
    const docs: Doc[] = [wallOf('conf-A')]
    for (let i = 0; i < 203; i++) {
      docs.push(...withPhoto(postOf('conf-A', `n${i}`, { approvedAt: at(i) })))
    }
    // Another conference's newer approvals must not take any of the 200.
    for (let i = 0; i < 5; i++) {
      docs.push(
        ...withPhoto(postOf('conf-B', `b${i}`, { approvedAt: at(500 + i) })),
      )
    }
    store().reset(docs)
    const { posts } = await visitor().get()
    expect(posts).toHaveLength(200)
    expect(posts[0]._id).toBe('wallPost-n202')
    expect(posts[199]._id).toBe('wallPost-n3')
    expect(posts.some((p) => p._id === 'wallPost-n2')).toBe(false)
  })

  it('does not count a post without a photo against the 200', async () => {
    const docs: Doc[] = [wallOf('conf-A')]
    for (let i = 0; i < 200; i++) {
      docs.push(...withPhoto(postOf('conf-A', `n${i}`, { approvedAt: at(i) })))
    }
    docs.push(
      postOf('conf-A', 'bare', { photo: undefined, approvedAt: at(900) }),
    )
    store().reset(docs)
    const { posts } = await visitor().get()
    expect(posts).toHaveLength(200)
    expect(posts.at(-1)?._id).toBe('wallPost-n0')
  })

  it('says whether posting is open (§7, §9.1)', async () => {
    store().reset([wallOf('conf-A', { postingMode: 'paused' })])
    expect(await visitor().get()).toMatchObject({ postingOpen: false })
    store().reset([wallOf('conf-A', { postingMode: 'open' })])
    expect(await visitor().get()).toMatchObject({ postingOpen: true })
    // Automatic, after the last day.
    store().reset([wallOf('conf-A', { postingMode: 'auto' })])
    vi.setSystemTime(new Date('2026-10-28T08:00:00Z'))
    expect(await visitor().get()).toMatchObject({ postingOpen: false })
  })

  it('carries the sponsor strip switch to the screens (§9.4)', async () => {
    store().reset([wallOf('conf-A', { sponsorStrip: true })])
    expect(await visitor().get()).toMatchObject({ sponsorStrip: true })
  })

  it('answers no post once the wall has closed (§9.1, §11.1)', async () => {
    store().reset([
      wallOf('conf-A', { closedAt: '2026-11-26T03:00:00Z' }),
      ...withPhoto(postOf('conf-A', 'a1')),
    ])
    await expect(visitor().get()).resolves.toEqual({
      closed: true,
      postingOpen: false,
      sponsorStrip: false,
      posts: [],
    })
  })

  it('is NOT_FOUND for a conference without a Photo Wall (§4.1)', async () => {
    store().reset([wallOf('conf-B'), ...withPhoto(postOf('conf-A', 'a1'))])
    await expect(visitor().get()).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('is NOT_FOUND, reading nothing, when the host names no conference', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'a1'))])
    tenant.error = new Error('unknown host')
    await expect(visitor().get()).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(store().reads).toEqual([])
  })

  it('takes the conference from the host, never from the client', async () => {
    store().reset([
      wallOf('conf-A'),
      wallOf('conf-B'),
      ...withPhoto(postOf('conf-A', 'a1')),
      ...withPhoto(postOf('conf-B', 'b1')),
    ])
    const get = visitor().get as unknown as (input: unknown) => Promise<{
      posts: { _id: string }[]
    }>
    const { posts } = await get({ conferenceId: 'conf-B' })
    expect(posts.map((p) => p._id)).toEqual(['wallPost-a1'])
    // And the host decides: another tenant gets its own wall.
    tenant.conference = { _id: 'conf-B' }
    expect((await visitor().get()).posts.map((p) => p._id)).toEqual([
      'wallPost-b1',
    ])
  })

  it('is cached per conference under the public wall tag, default life, on the non-CDN client (§8)', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'a1'))])
    await visitor().get()
    expect(h.cacheTag).toHaveBeenCalledWith('photo-wall:conf-A')
    expect(h.cacheTag).not.toHaveBeenCalledWith(
      expect.stringMatching(/^photo-wall-(admin|device):/),
    )
    expect(h.cacheLife).toHaveBeenCalledWith('default')
    const reads = store().reads.filter((r) => r.query.includes('wallPost'))
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every((r) => r.client === 'uncached')).toBe(true)
  })

  it('polls without a live conference read: the cached tenant read only (§8)', async () => {
    store().reset([wallOf('conf-A')])
    for (let poll = 0; poll < 3; poll++) await visitor().get()
    const calls = vi.mocked(getConferenceForCurrentDomain).mock.calls
    expect(calls).toHaveLength(3)
    expect(
      calls.filter(([opts]) => (opts as { uncached?: boolean })?.uncached),
    ).toEqual([])
  })
})
