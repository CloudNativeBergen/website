/**
 * @vitest-environment node
 *
 * The Server Actions of `/wall/post` (Photo Wall spec §6.1, §8, §12, §14):
 * `ensureDevice()`'s `Set-Cookie` and the cookie replayed into a second
 * call, then My posts, Delete and the Marketing switch acting as the cookie's
 * device and no other, every read and write EXECUTED on the versioned
 * in-memory store. Tag expiry is `updateTag` (a Server Action), asserted on
 * the mock of `next/cache`.
 */
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  jar: new Map<string, string>(),
  sets: [] as { name: string; value: string; options: unknown }[],
  resolution: {} as Record<string, unknown>,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      h.jar.has(name) ? { name, value: h.jar.get(name) } : undefined,
    set: (name: string, value: string, options: unknown) => {
      h.sets.push({ name, value, options })
      h.jar.set(name, value)
    },
  }),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => h.resolution,
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  // The image builder: the suite-wide `@sanity/image-url` mock (one URL).
  const { createImageUrlBuilder } = await import('@sanity/image-url')
  const builder = createImageUrlBuilder({
    projectId: 'proj',
    dataset: 'production',
  })
  return { ...h.store.clients, sanityImage: (s: string) => builder.image(s) }
})

import { updateTag } from 'next/cache'
import { readWallDevice } from '@/lib/photo-wall/device'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  deleteMyPost,
  ensureDevice,
  getMyPosts,
  setMyPostMarketing,
} from './actions'

const conference = { _id: 'conf-A', endDate: '2026-10-27' }
const wallOf = (ref: string) => ({
  _id: 'photoWall-conf-A',
  _type: 'photoWall',
  conference: { _type: 'reference', _ref: ref },
})

beforeEach(() => {
  h.jar.clear()
  h.sets.length = 0
  h.resolution = { conference, error: null, status: 'resolved' }
  h.store!.reset([wallOf('conf-A')])
})

describe('ensureDevice', () => {
  it('sets konf_wall: httpOnly, SameSite=Lax, Path=/wall, Secure, expiring at the end of the deletion date', async () => {
    await expect(ensureDevice()).resolves.toBe(true)
    expect(h.sets).toHaveLength(1)
    const [{ name, value, options }] = h.sets
    expect(name).toBe('konf_wall')
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/wall',
      // 2026-10-27 + 30 days = 26 November, 23:59:59 in Oslo (CET).
      expires: new Date('2026-11-26T22:59:59.000Z'),
    })
    expect(readWallDevice(value)).not.toBeNull()
  })

  it('keeps a valid cookie when the cookie is replayed into a second call', async () => {
    await ensureDevice()
    const first = h.jar.get('konf_wall')
    await expect(ensureDevice()).resolves.toBe(true)
    expect(h.sets).toHaveLength(1)
    expect(h.jar.get('konf_wall')).toBe(first)
  })

  it('replaces a cookie whose signature does not verify', async () => {
    h.jar.set('konf_wall', 'forged.cookie')
    await expect(ensureDevice()).resolves.toBe(true)
    expect(h.sets).toHaveLength(1)
    expect(readWallDevice(h.jar.get('konf_wall'))).not.toBeNull()
  })

  it.each([
    ['the conference has no wall', () => h.store!.reset([])],
    [
      "only another conference's wall is under this id",
      () => h.store!.reset([wallOf('conf-B')]),
    ],
    [
      'the host has no conference',
      () => (h.resolution = { conference: {}, status: 'not-found' }),
    ],
    [
      'the conference read failed',
      () => (h.resolution = { conference: {}, status: 'unavailable' }),
    ],
    [
      'the conference has no end date',
      () =>
        (h.resolution = {
          conference: { _id: 'conf-A' },
          error: null,
          status: 'resolved',
        }),
    ],
  ])('sets no cookie when %s', async (_name, arrange) => {
    arrange()
    await expect(ensureDevice()).resolves.toBe(false)
    expect(h.sets).toEqual([])
  })
})

const DEVICE_POST = 'wallPost-11111111-1111-4111-8111-111111111111'
const OTHER_POST = 'wallPost-22222222-2222-4222-8222-222222222222'
const ASSET = 'image-sha1-1600x1000-jpg'
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const post = (id: string, fields: Record<string, unknown> = {}) => ({
  _id: id,
  _type: 'wallPost',
  _rev: `rev-${id}`,
  _createdAt: '2026-10-26T07:30:00.000Z',
  conference: ref('conf-A'),
  status: 'approved',
  photo: { _type: 'image', asset: ref(ASSET) },
  crop: { x: 0.5, y: 0.5 },
  caption: 'Keynote',
  name: 'Ada',
  marketingConsent: true,
  deviceKey: 'device-x',
  submittedAt: '2026-10-26T07:30:00Z',
  ...fields,
})
const asset = (id = ASSET) => ({
  _id: id,
  _type: 'sanity.imageAsset',
  _rev: `rev-${id}`,
  url: `https://cdn.sanity.io/images/proj/production/${id}.jpg`,
  metadata: { dimensions: { width: 1600, height: 1000 } },
})

/** This phone's device, by way of its cookie, with its own post on the wall. */
async function phoneWithPost(fields: Record<string, unknown> = {}) {
  await ensureDevice()
  const key = readWallDevice(h.jar.get('konf_wall'))!.key
  h.store!.reset([
    wallOf('conf-A'),
    asset(),
    asset('image-sha2-1600x1000-jpg'),
    post(DEVICE_POST, { deviceKey: key, ...fields }),
    // Another device's post on this wall, with the same asset bytes.
    post(OTHER_POST, {
      deviceKey: 'device-other',
      photo: { _type: 'image', asset: ref('image-sha2-1600x1000-jpg') },
    }),
  ])
  return key
}

const expired = () => vi.mocked(updateTag).mock.calls.map(([tag]) => tag)

beforeEach(() => {
  vi.mocked(updateTag).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getMyPosts', () => {
  it('throws, never an empty list, when the conference read failed: the phone keeps the list it has', async () => {
    await phoneWithPost()
    h.resolution = { conference: {}, status: 'unavailable' }
    await expect(getMyPosts()).rejects.toThrow()
  })

  it("lists the cookie's device's posts on this wall, by the device key the cookie stands for", async () => {
    await phoneWithPost()
    const posts = await getMyPosts()
    expect(posts.map((p) => p._id)).toEqual([DEVICE_POST])
    expect(posts[0]).toMatchObject({ status: 'approved', caption: 'Keynote' })
  })

  it('is empty, reading no post, without a cookie or with one that does not verify', async () => {
    await phoneWithPost()
    h.jar.delete('konf_wall')
    await expect(getMyPosts()).resolves.toEqual([])
    h.jar.set('konf_wall', 'forged.cookie')
    await expect(getMyPosts()).resolves.toEqual([])
    expect(h.store!.reads.filter((r) => r.query.includes('wallPost'))).toEqual(
      [],
    )
  })

  it('is empty when the host has no conference', async () => {
    await phoneWithPost()
    h.resolution = { conference: {}, status: 'not-found' }
    await expect(getMyPosts()).resolves.toEqual([])
  })
})

describe('deleteMyPost', () => {
  it("also expires a tagged post's talk (Talk photos spec §8)", async () => {
    await phoneWithPost({ talk: ref('talk-1') })
    await expect(deleteMyPost(DEVICE_POST)).resolves.toEqual({
      status: 'deleted',
    })
    expect(expired()).toContain('photo-wall-talk:talk-1')
  })

  it('throws, never gone, when the conference read failed: reading, writing and expiring nothing, so the card stays to press again', async () => {
    await phoneWithPost()
    h.resolution = { conference: {}, status: 'unavailable' }
    await expect(deleteMyPost(DEVICE_POST)).rejects.toThrow()
    expect(h.store!.docReads).toEqual([])
    expect(h.store!.commits).toEqual([])
    expect(expired()).toEqual([])
  })

  it('a mark refused outright (409), then a re-read that throws, expires nothing: nothing was written', async () => {
    await phoneWithPost()
    const reads = vi.spyOn(clientReadUncached, 'getDocument')
    onTestFinished(() => reads.mockRestore())
    h.store!.beforeNextCommit(() => {
      h.store!.put({ ...h.store!.doc(DEVICE_POST)!, _rev: 'rev-other' })
      reads.mockRejectedValueOnce(new Error('503: read refused'))
    })
    await expect(deleteMyPost(DEVICE_POST)).rejects.toThrow('503')
    expect(h.store!.commits).toEqual([])
    expect(h.store!.doc(DEVICE_POST)).toMatchObject({ status: 'approved' })
    expect(expired()).toEqual([])
  })

  it("deletes the device's own post and its asset, and expires the wall, the queue and the device", async () => {
    const key = await phoneWithPost()
    await expect(deleteMyPost(DEVICE_POST)).resolves.toEqual({
      status: 'deleted',
    })
    expect(h.store!.doc(DEVICE_POST)).toBeUndefined()
    expect(h.store!.doc(ASSET)).toBeUndefined()
    expect(h.store!.doc(OTHER_POST)).toBeDefined()
    expect(expired().sort()).toEqual([
      'photo-wall-admin:conf-A',
      `photo-wall-device:${key}`,
      'photo-wall:conf-A',
    ])
  })

  it("is gone, writing nothing and expiring nothing, for another device's post", async () => {
    await phoneWithPost()
    await expect(deleteMyPost(OTHER_POST)).resolves.toEqual({ status: 'gone' })
    expect(h.store!.commits).toEqual([])
    expect(h.store!.doc(OTHER_POST)).toMatchObject({ status: 'approved' })
    // Nothing was written, so no screen or admin poll is made to refill:
    // a phone looping Delete on ids it does not own must cost nothing.
    expect(expired()).toEqual([])
  })

  it('is gone, writing nothing and expiring nothing, for a missing post', async () => {
    await phoneWithPost()
    await expect(deleteMyPost('wallPost-nope')).resolves.toEqual({
      status: 'gone',
    })
    expect(h.store!.commits).toEqual([])
    expect(expired()).toEqual([])
  })

  it('is gone, reading, writing and expiring nothing, without a cookie: never a Delete of any post', async () => {
    await phoneWithPost()
    h.jar.delete('konf_wall')
    await expect(deleteMyPost(DEVICE_POST)).resolves.toEqual({ status: 'gone' })
    expect(h.store!.docReads).toEqual([])
    expect(h.store!.commits).toEqual([])
    expect(h.store!.doc(DEVICE_POST)).toMatchObject({ status: 'approved' })
    expect(expired()).toEqual([])
  })

  it('a read that throws before any write expires nothing: no write was attempted', async () => {
    await phoneWithPost()
    const refuse = vi
      .spyOn(clientReadUncached, 'getDocument')
      .mockRejectedValueOnce(new Error('503: read refused'))
    onTestFinished(() => refuse.mockRestore())
    await expect(deleteMyPost(DEVICE_POST)).rejects.toThrow('503')
    expect(refuse).toHaveBeenCalledTimes(1)
    expect(h.store!.commits).toEqual([])
    expect(expired()).toEqual([])
  })

  it('a mark that committed but whose answer was lost expires the tags: the post left the wall', async () => {
    const key = await phoneWithPost()
    h.store!.afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    await expect(deleteMyPost(DEVICE_POST)).rejects.toThrow('socket hang up')
    expect(h.store!.doc(DEVICE_POST)).toMatchObject({ status: 'deleting' })
    expect(expired().sort()).toEqual([
      'photo-wall-admin:conf-A',
      `photo-wall-device:${key}`,
      'photo-wall:conf-A',
    ])
  })

  it('a failed asset delete answers failed and leaves the post deleting; pressing again finishes it', async () => {
    const key = await phoneWithPost()
    const writer = clientWrite as unknown as {
      mutate: (m: { delete: { id: string } }[]) => Promise<unknown>
    }
    const real = writer.mutate
    const refuse = vi.spyOn(writer, 'mutate').mockImplementation(async (m) => {
      if (m[m.length - 1].delete.id === ASSET) {
        throw Object.assign(new Error('409: contention'), { statusCode: 409 })
      }
      return real(m)
    })
    await expect(deleteMyPost(DEVICE_POST)).resolves.toEqual({
      status: 'failed',
    })
    expect(h.store!.doc(DEVICE_POST)).toMatchObject({
      status: 'deleting',
      deletingAssetId: ASSET,
    })
    // The mark was written: the post left the wall and the card must show
    // the deleting state, so every tag is expired.
    expect(expired().sort()).toEqual([
      'photo-wall-admin:conf-A',
      `photo-wall-device:${key}`,
      'photo-wall:conf-A',
    ])
    refuse.mockRestore()

    await expect(deleteMyPost(DEVICE_POST)).resolves.toEqual({
      status: 'deleted',
    })
    expect(h.store!.doc(DEVICE_POST)).toBeUndefined()
    expect(h.store!.doc(ASSET)).toBeUndefined()
  })
})

describe('setMyPostMarketing', () => {
  it('throws, never gone, when the conference read failed, writing and expiring nothing', async () => {
    await phoneWithPost()
    h.resolution = { conference: {}, status: 'unavailable' }
    await expect(setMyPostMarketing(DEVICE_POST, false)).rejects.toThrow()
    expect(h.store!.docReads).toEqual([])
    expect(h.store!.commits).toEqual([])
    expect(expired()).toEqual([])
  })

  it('a patch refused outright (409), then a re-read that throws, expires nothing', async () => {
    await phoneWithPost()
    const reads = vi.spyOn(clientReadUncached, 'getDocument')
    onTestFinished(() => reads.mockRestore())
    h.store!.beforeNextCommit(() => {
      h.store!.put({ ...h.store!.doc(DEVICE_POST)!, _rev: 'rev-other' })
      reads.mockRejectedValueOnce(new Error('503: read refused'))
    })
    await expect(setMyPostMarketing(DEVICE_POST, false)).rejects.toThrow('503')
    expect(h.store!.commits).toEqual([])
    expect(h.store!.doc(DEVICE_POST)).toMatchObject({ marketingConsent: true })
    expect(expired()).toEqual([])
  })

  it("patches the device's own post, guarded by its revision, and expires the queue and the device but not the wall", async () => {
    const key = await phoneWithPost()
    await expect(setMyPostMarketing(DEVICE_POST, false)).resolves.toEqual({
      status: 'done',
    })
    expect(h.store!.commits).toEqual([
      [
        {
          patch: {
            id: DEVICE_POST,
            ifRevisionID: `rev-${DEVICE_POST}`,
            set: { marketingConsent: false },
          },
        },
      ],
    ])
    expect(expired().sort()).toEqual([
      'photo-wall-admin:conf-A',
      `photo-wall-device:${key}`,
    ])
    const [mine] = await getMyPosts()
    expect(mine.marketingConsent).toBe(false)
  })

  it("is gone, writing and expiring nothing, for another device's post", async () => {
    await phoneWithPost()
    await expect(setMyPostMarketing(OTHER_POST, false)).resolves.toEqual({
      status: 'gone',
    })
    expect(h.store!.commits).toEqual([])
    expect(h.store!.doc(OTHER_POST)).toMatchObject({ marketingConsent: true })
    expect(expired()).toEqual([])
  })

  it('is gone, reading, writing and expiring nothing, without a cookie', async () => {
    await phoneWithPost()
    h.jar.delete('konf_wall')
    await expect(setMyPostMarketing(DEVICE_POST, false)).resolves.toEqual({
      status: 'gone',
    })
    expect(h.store!.docReads).toEqual([])
    expect(h.store!.commits).toEqual([])
    expect(expired()).toEqual([])
  })

  it('a change that committed but whose answer was lost expires the queue and the device, not the wall', async () => {
    const key = await phoneWithPost()
    h.store!.afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    await expect(setMyPostMarketing(DEVICE_POST, false)).rejects.toThrow(
      'socket hang up',
    )
    expect(h.store!.doc(DEVICE_POST)).toMatchObject({ marketingConsent: false })
    expect(expired().sort()).toEqual([
      'photo-wall-admin:conf-A',
      `photo-wall-device:${key}`,
    ])
  })

  it('a read that throws before any write expires nothing', async () => {
    await phoneWithPost()
    const refuse = vi
      .spyOn(clientReadUncached, 'getDocument')
      .mockRejectedValueOnce(new Error('503: read refused'))
    onTestFinished(() => refuse.mockRestore())
    await expect(setMyPostMarketing(DEVICE_POST, false)).rejects.toThrow('503')
    expect(refuse).toHaveBeenCalledTimes(1)
    expect(h.store!.commits).toEqual([])
    expect(expired()).toEqual([])
  })

  it('conflicted twice: changed, nothing written, nothing expired', async () => {
    await phoneWithPost()
    for (const rev of ['rev-second', 'rev-third']) {
      h.store!.beforeNextCommit(() =>
        h.store!.put({ ...h.store!.doc(DEVICE_POST)!, _rev: rev }),
      )
    }
    await expect(setMyPostMarketing(DEVICE_POST, false)).resolves.toEqual({
      status: 'changed',
    })
    expect(h.store!.commits).toEqual([])
    expect(expired()).toEqual([])
  })

  it('refuses a value that is not a boolean, and an id that is not a Wall Post id, before any read', async () => {
    await phoneWithPost()
    await expect(
      setMyPostMarketing(DEVICE_POST, 'yes' as unknown as boolean),
    ).resolves.toEqual({ status: 'gone' })
    await expect(
      setMyPostMarketing(`${DEVICE_POST},${OTHER_POST}`, false),
    ).resolves.toEqual({ status: 'gone' })
    expect(h.store!.docReads).toEqual([])
    expect(h.store!.commits).toEqual([])
  })
})
