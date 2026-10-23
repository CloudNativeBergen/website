/**
 * @vitest-environment node
 *
 * The 404 rule of the `/wall` routes (Photo Wall spec §4.1), on each page
 * module, with the wall read EXECUTED as GROQ on the versioned in-memory
 * store: a conference without a `photoWall` has no Photo Wall, and another
 * conference's wall doesn't give it one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  resolution: {} as Record<string, unknown>,
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => h.resolution,
}))

import WallPage from './page'
import ComposerPage from './post/page'
import ScreenPage from './screen/page'

const conference = {
  _id: 'conf-A',
  title: 'CND 2026',
  endDate: '2026-10-27',
  domains: ['2026.example.no'],
}
const wallOf = (conferenceId: string) => ({
  _id: `photoWall-${conferenceId}`,
  _type: 'photoWall',
  conference: { _type: 'reference', _ref: conferenceId },
})
const NOT_FOUND = { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }

const ROUTES = [
  ['/wall', WallPage],
  ['/wall/post', ComposerPage],
  ['/wall/screen', ScreenPage],
] as const

beforeEach(() => {
  h.store!.reset()
  h.resolution = { conference, error: null, status: 'resolved' }
})

describe.each(ROUTES)('%s', (_path, Page) => {
  it('is 404 when the conference has no Photo Wall', async () => {
    await expect(Page()).rejects.toMatchObject(NOT_FOUND)
  })

  it('is 404 when only another conference has one', async () => {
    h.store!.reset([wallOf('conf-B')])
    await expect(Page()).rejects.toMatchObject(NOT_FOUND)
  })

  it('renders once the conference has a Photo Wall', async () => {
    h.store!.reset([wallOf('conf-A')])
    await expect(Page()).resolves.toBeTruthy()
  })

  it('is 404 on a host with no conference', async () => {
    h.resolution = { conference: {}, status: 'not-found' }
    await expect(Page()).rejects.toMatchObject(NOT_FOUND)
  })

  it('throws, not 404, when the conference read failed', async () => {
    h.resolution = { conference: {}, status: 'unavailable' }
    h.store!.reset([wallOf('conf-A')])
    const error = await Page().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toMatchObject(NOT_FOUND)
  })
})
