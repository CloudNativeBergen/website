/**
 * @vitest-environment node
 *
 * The `photoWall` router (Photo Wall spec §4.1, §7, §10) through the tRPC
 * caller and the REAL authz waist, on the versioned in-memory store: GROQ is
 * EXECUTED with groq-js, and writes are built by the real `@sanity/client`
 * and applied with `@sanity/mutator`. Only the cache expiry is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  revalidateTag: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  updateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      title: 'CND 2026',
      organization: { _ref: 'org-A' },
      endDate: '2026-10-27',
      domains: ['2026.example.no'],
    },
    error: null,
  }),
}))

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { photoWallRouter } from './photoWall'

type Doc = Record<string, unknown> & { _id: string }
const store = () => h.store!

const t = initTRPC.context<Context>().create()
function caller(speakerId: string, orgIds?: string[]) {
  const speaker = {
    _id: speakerId,
    name: speakerId,
    ...(orgIds && { organizerOrgIds: orgIds }),
  }
  const user = { email: `${speakerId}@example.com`, name: 'x', picture: '' }
  return t.createCallerFactory(photoWallRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}
const organizer = () => caller('sp-org', ['org-A'])

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const wallOf = (conferenceId: string, fields: Record<string, unknown> = {}) =>
  ({
    _id: `photoWall-${conferenceId}`,
    _type: 'photoWall',
    _rev: `rev-${conferenceId}`,
    conference: ref(conferenceId),
    ...fields,
  }) as Doc

const LINKS = {
  post: 'https://2026.example.no/wall/post',
  wall: 'https://2026.example.no/wall',
  screen: 'https://2026.example.no/wall/screen',
}

beforeEach(() => {
  store().reset()
  h.revalidateTag.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-26T08:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('photoWall.settings', () => {
  it('has no wall before Set up, with the links of the conference domain', async () => {
    await expect(organizer().settings()).resolves.toEqual({
      wall: null,
      postingOpen: false,
      links: LINKS,
    })
  })

  it("does not count another conference's wall", async () => {
    store().reset([wallOf('conf-B', { postingMode: 'open' })])
    const view = await organizer().settings()
    expect(view.wall).toBeNull()
  })

  it('reads a missing mode as Paused and a missing strip as off', async () => {
    store().reset([wallOf('conf-A')])
    const view = await organizer().settings()
    expect(view.wall).toEqual({
      _id: 'photoWall-conf-A',
      postingMode: 'paused',
      sponsorStrip: false,
      closedAt: null,
    })
    expect(view.postingOpen).toBe(false)
  })

  it('says whether posting is open now (§7)', async () => {
    store().reset([wallOf('conf-A', { postingMode: 'open' })])
    expect((await organizer().settings()).postingOpen).toBe(true)
    // After the end of the last day, the switch still says Open.
    vi.setSystemTime(new Date('2026-10-27T23:00:00Z'))
    const later = await organizer().settings()
    expect(later.wall?.postingMode).toBe('open')
    expect(later.postingOpen).toBe(false)
  })

  it('reads on the non-CDN client', async () => {
    await organizer().settings()
    expect(store().reads.length).toBeGreaterThan(0)
    expect(store().reads.every((r) => r.client === 'uncached')).toBe(true)
  })
})

describe('photoWall.setUp (§4.1)', () => {
  it('creates the wall paused, with the strip off', async () => {
    const view = await organizer().setUp()
    expect(store().doc('photoWall-conf-A')).toMatchObject({
      _type: 'photoWall',
      conference: { _type: 'reference', _ref: 'conf-A' },
      postingMode: 'paused',
      sponsorStrip: false,
    })
    expect(view.wall?.postingMode).toBe('paused')
    expect(h.revalidateTag).toHaveBeenCalledWith('photo-wall:conf-A', {
      expire: 0,
    })
  })

  it('converges on a second press without resetting the settings', async () => {
    await organizer().setUp()
    await organizer().updateSettings({
      postingMode: 'open',
      sponsorStrip: true,
    })
    const again = await organizer().setUp()
    expect(again.wall).toMatchObject({
      postingMode: 'open',
      sponsorStrip: true,
    })
    expect(
      store()
        .all()
        .filter((d) => d._type === 'photoWall'),
    ).toHaveLength(1)
  })
})

describe('photoWall.updateSettings (§10)', () => {
  beforeEach(() => store().reset([wallOf('conf-A', { postingMode: 'paused' })]))

  it('opens and pauses posting', async () => {
    await organizer().updateSettings({ postingMode: 'open' })
    expect(store().doc('photoWall-conf-A')?.postingMode).toBe('open')
    const view = await organizer().updateSettings({ postingMode: 'paused' })
    expect(store().doc('photoWall-conf-A')?.postingMode).toBe('paused')
    expect(view.wall?.postingMode).toBe('paused')
  })

  it('switches the sponsor strip and leaves the mode alone', async () => {
    await organizer().updateSettings({ sponsorStrip: true })
    expect(store().doc('photoWall-conf-A')).toMatchObject({
      sponsorStrip: true,
      postingMode: 'paused',
    })
  })

  it('expires the wall tag with expire: 0 on each change (§8)', async () => {
    await organizer().updateSettings({ sponsorStrip: true })
    expect(h.revalidateTag).toHaveBeenCalledWith('photo-wall:conf-A', {
      expire: 0,
    })
  })

  it('refuses before Set up, writing nothing', async () => {
    store().reset([wallOf('conf-B')])
    await expect(
      organizer().updateSettings({ postingMode: 'open' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(store().commits).toEqual([])
    expect(store().doc('photoWall-conf-B')?.postingMode).toBeUndefined()
  })

  it('refuses a mode Monday does not offer, and an empty change', async () => {
    await expect(
      organizer().updateSettings({ postingMode: 'auto' as 'open' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(organizer().updateSettings({})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(store().commits).toEqual([])
  })
})

describe('organizers of the conference organization only (§10)', () => {
  beforeEach(() => store().reset([wallOf('conf-A', { postingMode: 'paused' })]))

  it.each([
    ['a speaker', () => caller('sp-ada')],
    ['an organizer of another organization', () => caller('sp-x', ['org-B'])],
  ])('refuses %s, writing nothing', async (_who, as) => {
    await expect(as().setUp()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      as().updateSettings({ postingMode: 'open' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(as().settings()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(store().commits).toEqual([])
    expect(store().doc('photoWall-conf-A')?.postingMode).toBe('paused')
  })
})
