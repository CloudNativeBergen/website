/**
 * @vitest-environment node
 *
 * The 404 rule of the `/wall` routes (Photo Wall spec §4.1), on each page
 * module, with the wall read EXECUTED as GROQ on the versioned in-memory
 * store: a conference without a `photoWall` has no Photo Wall, and another
 * conference's wall doesn't give it one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => h.resolution,
}))

import { ComposerClosed, WallPoster } from '@/components/photo-wall'
import { ensureDevice } from './post/actions'
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

  it("is 404 when this conference's wall id belongs to another conference", async () => {
    h.store!.reset([
      {
        ...wallOf('conf-A'),
        conference: { _type: 'reference', _ref: 'conf-B' },
      },
    ])
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
    expect(error).toMatchObject({
      message: 'Could not read the conference for this Photo Wall',
    })
    expect(error).not.toMatchObject(NOT_FOUND)
  })
})

describe('/wall/post while posting is open or not (§6.5, §7)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the composer, wired to ensureDevice, while posting is open', async () => {
    h.store!.reset([{ ...wallOf('conf-A'), postingMode: 'open' }])
    const page = await ComposerPage()
    expect(page.type).toBe(WallPoster)
    expect(page.props).toMatchObject({
      deletesOn: '2026-11-26',
      ensureDevice,
    })
  })

  it.each([
    ['paused', { postingMode: 'paused' }, '2026-10-26T10:00:00.000Z'],
    [
      'open, after the last day',
      { postingMode: 'open' },
      '2026-10-27T23:00:00.000Z',
    ],
    [
      'closed by the cron',
      { postingMode: 'open', closedAt: '2026-11-27T00:00:00Z' },
      '2026-10-26T10:00:00.000Z',
    ],
  ])('shows the closed page when %s', async (_name, settings, now) => {
    vi.setSystemTime(new Date(now))
    h.store!.reset([{ ...wallOf('conf-A'), ...settings }])
    const page = await ComposerPage()
    expect(page.type).toBe(ComposerClosed)
  })
})
