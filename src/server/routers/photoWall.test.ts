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
const CONFERENCE = {
  _id: 'conf-A',
  title: 'CND 2026',
  organization: { _ref: 'org-A' },
  endDate: '2026-10-27',
  domains: ['2026.example.no'],
}
const cdn = vi.hoisted(() => ({
  /** What a CDN read answers, when it lags the live one. */
  conference: null as null | Record<string, unknown>,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async (opts?: { uncached?: boolean }) => ({
    conference: opts?.uncached
      ? CONFERENCE
      : { ...CONFERENCE, ...cdn.conference },
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
  cdn.conference = null
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
      posting: 'paused',
      links: LINKS,
    })
  })

  it("does not count another conference's wall", async () => {
    store().reset([wallOf('conf-B', { postingMode: 'open' })])
    const view = await organizer().settings()
    expect(view.wall).toBeNull()
  })

  it("does not count a wall with this conference's id that belongs to another", async () => {
    // Only the tenant predicate tells this one apart: the id matches.
    store().reset([{ ...wallOf('conf-A'), conference: ref('conf-B') }])
    expect((await organizer().settings()).wall).toBeNull()
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
    expect(view.posting).toBe('paused')
  })

  it('says whether posting is open now (§7)', async () => {
    store().reset([wallOf('conf-A', { postingMode: 'open' })])
    expect((await organizer().settings()).posting).toBe('open')
    // After the end of the last day, the switch still says Open.
    vi.setSystemTime(new Date('2026-10-27T23:00:00Z'))
    const later = await organizer().settings()
    expect(later.wall?.postingMode).toBe('open')
    expect(later.posting).toBe('ended')
  })

  it('reads the conference live, not from a CDN copy that lags Settings', async () => {
    store().reset([wallOf('conf-A', { postingMode: 'open' })])
    // The organizer just moved the end date; the CDN still has the old one.
    cdn.conference = { endDate: '2026-10-01', domains: ['old.example.no'] }
    const view = await organizer().settings()
    expect(view.posting).toBe('open')
    expect(view.links.wall).toBe('https://2026.example.no/wall')
  })

  it('refuses, writing nothing, when the live read is another conference than the tenant', async () => {
    store().reset([wallOf('conf-A')])
    cdn.conference = { _id: 'conf-Z' }
    const error = await organizer()
      .updateSettings({ postingMode: 'open' })
      .catch((e: unknown) => e)
    // The code AND the exit: two refusals answer NOT_FOUND.
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
    expect((error as Error).message).toBe(
      'Could not resolve conference from domain',
    )
    expect(store().commits).toEqual([])
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

  it('answers with the wall as stored, including a change that landed meanwhile', async () => {
    // Another organizer switches the strip on between the read and the patch.
    store().beforeNextCommit(() =>
      store().put({ ...store().doc('photoWall-conf-A')!, sponsorStrip: true }),
    )
    const view = await organizer().updateSettings({ postingMode: 'open' })
    expect(view.wall).toMatchObject({ postingMode: 'open', sponsorStrip: true })
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
    const error = await organizer()
      .updateSettings({ postingMode: 'open' })
      .catch((e: unknown) => e)
    // The code AND the exit: two refusals answer NOT_FOUND.
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
    expect((error as Error).message).toBe('Set up the Photo Wall first')
    expect(store().commits).toEqual([])
    expect(store().doc('photoWall-conf-B')?.postingMode).toBeUndefined()
  })

  it('refuses a field it does not know, writing nothing', async () => {
    await expect(
      organizer().updateSettings({
        postingMode: 'open',
        closedAt: null,
      } as { postingMode: 'open' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(store().commits).toEqual([])
  })

  it('answers with the change even when the cache expiry throws', async () => {
    h.revalidateTag.mockImplementationOnce(() => {
      throw new Error('outside a request scope')
    })
    const view = await organizer().updateSettings({ postingMode: 'open' })
    expect(view.wall?.postingMode).toBe('open')
    expect(store().doc('photoWall-conf-A')?.postingMode).toBe('open')
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
