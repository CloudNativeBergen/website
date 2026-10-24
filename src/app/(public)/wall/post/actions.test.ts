/**
 * @vitest-environment node
 *
 * `ensureDevice()` (Photo Wall spec §6.1, §14): the `Set-Cookie` it asks for
 * and the cookie replayed into a second call, with the wall read EXECUTED on
 * the versioned in-memory store.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  return h.store.clients
})

import { readWallDevice } from '@/lib/photo-wall/device'
import { ensureDevice } from './actions'

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
