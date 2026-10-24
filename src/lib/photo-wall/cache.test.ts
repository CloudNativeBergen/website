/**
 * @vitest-environment node
 *
 * `getWall` once the retention cron closed the wall (Photo Wall spec
 * §11.1): the wall read EXECUTED as GROQ on the versioned store, and no
 * posts, read by no query at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { getWall } from './cache'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const ASSET = 'image-sha1-1600x1000-jpg'
const fixture = (wall: Record<string, unknown>) => [
  {
    _id: 'photoWall-conf-A',
    _type: 'photoWall',
    conference: ref('conf-A'),
    postingMode: 'open',
    ...wall,
  },
  {
    _id: 'wallPost-11111111-1111-4111-8111-111111111111',
    _type: 'wallPost',
    conference: ref('conf-A'),
    status: 'approved',
    photo: { _type: 'image', asset: ref(ASSET) },
    crop: { x: 0.5, y: 0.5 },
    approvedAt: '2026-10-26T10:00:00Z',
  },
  {
    _id: ASSET,
    _type: 'sanity.imageAsset',
    url: 'https://cdn.sanity.io/images/p/d/sha1-1600x1000.jpg',
    metadata: { dimensions: { width: 1600, height: 1000 } },
  },
]

beforeEach(() => store().reset(fixture({})))

describe('getWall (§8, §11.1)', () => {
  it('answers the approved posts of an open wall', async () => {
    const data = await getWall('conf-A')
    expect(data?.wall.closedAt).toBeNull()
    expect(data?.posts.map((p) => p._id)).toEqual([
      'wallPost-11111111-1111-4111-8111-111111111111',
    ])
  })

  it('answers no posts once closedAt is set, and reads none', async () => {
    store().reset(fixture({ closedAt: '2026-11-25T03:10:00Z' }))
    const data = await getWall('conf-A')
    expect(data?.wall.closedAt).toBe('2026-11-25T03:10:00Z')
    expect(data?.posts).toEqual([])
    expect(store().reads.filter((r) => r.query.includes('"wallPost"'))).toEqual(
      [],
    )
  })
})
