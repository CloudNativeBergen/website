/**
 * @vitest-environment node
 *
 * `photoWallPublic.talkPhotos` (talk photos spec §7.1): answers only what
 * `getTalkPhotos` returns for the host's conference, the first six and the
 * count. The opt-out and status rules live in `getTalkPhotos` (its own tests).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getTalkPhotos: vi.fn(),
  conference: { _id: 'conf-A' } as null | { _id: string },
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/photo-wall/cache', () => ({
  getTalkPhotos: h.getTalkPhotos,
  getWall: vi.fn(),
}))
vi.mock('@/lib/photo-wall/square', () => ({
  squareSrc: (p: { url: string }) => `${p.url}?square`,
  wholeSrc: (p: { url: string }) => `${p.url}?whole`,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: h.conference,
    error: null,
  })),
}))

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { photoWallPublicRouter } from './photoWallPublic'

const t = initTRPC.context<Context>().create()
const visitor = () =>
  t.createCallerFactory(photoWallPublicRouter)({} as unknown as Context)

const post = (i: number) => ({
  _id: `post-${i}`,
  photo: { url: `https://cdn/p${i}.jpg`, width: 800, height: 600 },
  crop: { x: 0.5, y: 0.5, zoom: 1 },
  caption: i === 0 ? 'Keynote' : null,
  name: null,
  approvedAt: '2026-10-26T10:00:00Z',
})

beforeEach(() => {
  h.getTalkPhotos.mockReset()
  h.conference = { _id: 'conf-A' }
})

describe('photoWallPublic.talkPhotos', () => {
  it('answers the first six of getTalkPhotos and the full count', async () => {
    h.getTalkPhotos.mockResolvedValue(Array.from({ length: 9 }, (_, i) => post(i)))
    const view = await visitor().talkPhotos({ talkId: 'talk-1' })
    expect(h.getTalkPhotos).toHaveBeenCalledWith('conf-A', 'talk-1')
    expect(view.count).toBe(9)
    expect(view.posts.map((p) => p._id)).toEqual(
      ['post-0', 'post-1', 'post-2', 'post-3', 'post-4', 'post-5'],
    )
    expect(view.posts[0]).toMatchObject({
      src: 'https://cdn/p0.jpg?square',
      whole: { src: 'https://cdn/p0.jpg?whole', width: 800, height: 600 },
      caption: 'Keynote',
    })
  })

  it('answers nothing when getTalkPhotos has nothing', async () => {
    h.getTalkPhotos.mockResolvedValue([])
    expect(await visitor().talkPhotos({ talkId: 'talk-1' })).toEqual({
      posts: [],
      count: 0,
    })
  })

  it('answers nothing without a conference, and never reads', async () => {
    h.conference = null
    expect(await visitor().talkPhotos({ talkId: 'talk-1' })).toEqual({
      posts: [],
      count: 0,
    })
    expect(h.getTalkPhotos).not.toHaveBeenCalled()
  })

  it('refuses an empty talk id', async () => {
    await expect(visitor().talkPhotos({ talkId: '' })).rejects.toThrow()
  })
})
