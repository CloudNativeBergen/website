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
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  updateTag: vi.fn(),
  cacheLife: h.cacheLife,
  cacheTag: h.cacheTag,
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  // The REAL URL builder, past the suite-wide alias (as
  // `src/lib/social/__tests__/rendition.test.ts` does): the queue's photo
  // URLs are what the installed library makes of a stored asset, not a
  // mock's canned string.
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
const cdn = vi.hoisted(() => ({
  /** What a CDN read answers, when it lags the live one. */
  conference: null as null | Record<string, unknown>,
  /** What the live read answers, when it differs from CONFERENCE. */
  live: null as null | Record<string, unknown>,
  /** After this many cached reads, the cached read names org-B. */
  movedAfter: null as null | number,
  cachedReads: 0,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(
    async (opts?: { uncached?: boolean }) => {
      if (opts?.uncached) {
        return { conference: { ...CONFERENCE, ...cdn.live }, error: null }
      }
      cdn.cachedReads += 1
      const moved = cdn.movedAfter !== null && cdn.cachedReads > cdn.movedAfter
      return {
        conference: {
          ...CONFERENCE,
          ...cdn.conference,
          ...(moved && { organization: { _ref: 'org-B' } }),
        },
        error: null,
      }
    },
  ),
}))

/** `stall`: the export count's read never answers, as a hung Sanity read. */
const count = vi.hoisted(() => ({ stall: false }))
vi.mock('@/lib/photo-wall/export', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/photo-wall/export')>()
  return {
    ...real,
    // Short, so a stalled count is given up on within the test.
    COUNT_TIMEOUT_MS: 50,
    countConsentedPhotos: (conferenceId: string, signal?: AbortSignal) =>
      count.stall && signal
        ? // As the real client does (measured, PR #1510): rejects on abort.
          new Promise<never>((_, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason)),
          )
        : real.countConsentedPhotos(conferenceId, signal),
  }
})

import { initTRPC } from '@trpc/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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
  count.stall = false
  cdn.conference = null
  cdn.live = null
  cdn.movedAfter = null
  cdn.cachedReads = 0
  vi.mocked(getConferenceForCurrentDomain).mockClear()
  store().reset()
  h.revalidateTag.mockClear()
  h.cacheTag.mockClear()
  h.cacheLife.mockClear()
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
      marketingExportCount: 0,
    })
  })

  it('counts the photos the consented ZIP export would hold, this wall’s only (P5)', async () => {
    const asset = (id: string) =>
      ({
        _id: `image-${id}-800x600-jpg`,
        _type: 'sanity.imageAsset',
        url: `https://cdn.sanity.io/images/test/test/${id}-800x600.jpg`,
      }) as Doc
    const post = (id: string, conference: string, fields = {}) =>
      ({
        _id: `wallPost-${id}`,
        _type: 'wallPost',
        conference: ref(conference),
        status: 'approved',
        marketingConsent: true,
        photo: { _type: 'image', asset: ref(`image-${id}-800x600-jpg`) },
        ...fields,
      }) as Doc
    store().reset([
      wallOf('conf-A'),
      ...['a1', 'a2', 'p1', 'x1', 'b1'].map(asset),
      post('a1', 'conf-A'),
      post('a2', 'conf-A'),
      post('p1', 'conf-A', { status: 'pending' }),
      post('x1', 'conf-A', { marketingConsent: false }),
      post('b1', 'conf-B'),
    ])
    expect((await organizer().settings()).marketingExportCount).toBe(2)
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

  it("does not count another type of this conference's document at the wall's id", async () => {
    store().reset([
      {
        _id: 'photoWall-conf-A',
        _type: 'wallPost',
        conference: ref('conf-A'),
        postingMode: 'open',
        sponsorStrip: true,
      },
    ])
    expect((await organizer().settings()).wall).toBeNull()
  })

  it('reads the wall at its own id, not another photoWall of this conference', async () => {
    // Stored first, so a read without the id predicate would find it first.
    const stray = {
      ...wallOf('conf-A', { postingMode: 'open', sponsorStrip: true }),
      _id: 'photoWall-conf-A-copy',
    }
    store().reset([stray])
    expect((await organizer().settings()).wall).toBeNull()
    store().reset([stray, wallOf('conf-A', { postingMode: 'paused' })])
    expect((await organizer().settings()).wall).toEqual({
      _id: 'photoWall-conf-A',
      postingMode: 'paused',
      sponsorStrip: false,
      closedAt: null,
    })
  })

  it('reads a stored strip that is not the boolean true as off', async () => {
    store().reset([wallOf('conf-A', { sponsorStrip: 'yes' })])
    expect((await organizer().settings()).wall?.sponsorStrip).toBe(false)
  })

  it('reads the closedAt the retention cron stored, and posting is closed', async () => {
    store().reset([
      wallOf('conf-A', {
        postingMode: 'open',
        closedAt: '2026-10-26T07:00:00Z',
      }),
    ])
    const view = await organizer().settings()
    expect(view.wall?.closedAt).toBe('2026-10-26T07:00:00Z')
    expect(view.posting).toBe('closed')
  })

  it('reads a missing mode as Automatic and a missing strip as off (§7)', async () => {
    store().reset([wallOf('conf-A')])
    const view = await organizer().settings()
    expect(view.wall).toEqual({
      _id: 'photoWall-conf-A',
      postingMode: 'auto',
      sponsorStrip: false,
      closedAt: null,
    })
    // 2026-10-26 08:00Z is the conference's first day.
    expect(view.posting).toBe('open')
  })

  it('reads a stored mode the switch does not offer as Paused, never open', async () => {
    store().reset([wallOf('conf-A', { postingMode: 'always' })])
    const view = await organizer().settings()
    expect(view.wall?.postingMode).toBe('paused')
    expect(view.posting).toBe('paused')
  })

  it('an Automatic wall is not yet open before the first day', async () => {
    store().reset([wallOf('conf-A', { postingMode: 'auto' })])
    vi.setSystemTime(new Date('2026-10-25T22:59:59Z'))
    expect((await organizer().settings()).posting).toBe('notYetOpen')
    vi.setSystemTime(new Date('2026-10-25T23:00:00Z'))
    expect((await organizer().settings()).posting).toBe('open')
  })

  it('an Automatic wall fails closed when the conference has no start date', async () => {
    store().reset([wallOf('conf-A', { postingMode: 'auto' })])
    cdn.live = { startDate: undefined }
    expect((await organizer().settings()).posting).toBe('noStartDate')
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

  it('refuses, writing nothing, when the conference has moved to another organization', async () => {
    store().reset([wallOf('conf-A')])
    // The cached read the authz waist used still names org-A; the live
    // document now belongs to org-B. An org-A organizer must not pass.
    cdn.live = { organization: { _ref: 'org-B' } }
    const error = await organizer()
      .updateSettings({ postingMode: 'open' })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
    expect((error as Error).message).toBe(
      'Could not resolve conference from domain',
    )
    expect(store().commits).toEqual([])
    await expect(organizer().settings()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('reads on the non-CDN client', async () => {
    await organizer().settings()
    expect(store().reads.length).toBeGreaterThan(0)
    expect(store().reads.every((r) => r.client === 'uncached')).toBe(true)
  })
})

describe('the export count is metadata: it never fails the wall (P5)', () => {
  const countReads = (read: { query: string }) =>
    read.query.startsWith('count(')

  const failCount = (how: 'rejects' | 'stalls') => {
    if (how === 'rejects') store().failReadsThat(countReads)
    else count.stall = true
    return vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  it.each(['rejects', 'stalls'] as const)(
    'settings still answers when the count read %s, with the count unknown',
    async (how) => {
      store().reset([wallOf('conf-A', { postingMode: 'open' })])
      const logged = failCount(how)
      const view = await organizer().settings()
      expect(view.wall?.postingMode).toBe('open')
      expect(view.marketingExportCount).toBeUndefined()
      expect(logged).toHaveBeenCalledWith(
        'Could not count the Photo Wall export',
        expect.anything(),
      )
      logged.mockRestore()
    },
    3000,
  )

  it.each(['rejects', 'stalls'] as const)(
    'a committed settings change reports success when the count read %s',
    async (how) => {
      store().reset([wallOf('conf-A', { postingMode: 'paused' })])
      const logged = failCount(how)
      const view = await organizer().updateSettings({ postingMode: 'open' })
      expect(store().doc('photoWall-conf-A')?.postingMode).toBe('open')
      expect(view.wall?.postingMode).toBe('open')
      expect(view.marketingExportCount).toBeUndefined()
      logged.mockRestore()
    },
    3000,
  )

  it.each(['rejects', 'stalls'] as const)(
    'a committed Set up reports success when the count read %s',
    async (how) => {
      const logged = failCount(how)
      const view = await organizer().setUp()
      expect(store().doc('photoWall-conf-A')?._type).toBe('photoWall')
      expect(view.wall).not.toBeNull()
      expect(view.marketingExportCount).toBeUndefined()
      logged.mockRestore()
    },
    3000,
  )
})

describe('photoWall.setUp (§4.1)', () => {
  it('creates the wall Automatic, with the strip off', async () => {
    const view = await organizer().setUp()
    expect(store().doc('photoWall-conf-A')).toMatchObject({
      _type: 'photoWall',
      conference: { _type: 'reference', _ref: 'conf-A' },
      postingMode: 'auto',
      sponsorStrip: false,
    })
    expect(view.wall?.postingMode).toBe('auto')
    expect(h.revalidateTag).toHaveBeenCalledWith('photo-wall:conf-A', {
      expire: 0,
    })
  })

  it('fails when the wall it wrote cannot be read back', async () => {
    // The query store lags the write: the wall is stored, not yet readable.
    store().readsLagFor('photoWall-conf-A', null)
    await expect(organizer().setUp()).rejects.toThrow(
      'The Photo Wall was not found after Set up',
    )
    expect(store().doc('photoWall-conf-A')?._type).toBe('photoWall')
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

  it('opens and pauses posting, and hands it back to Automatic', async () => {
    await organizer().updateSettings({ postingMode: 'open' })
    expect(store().doc('photoWall-conf-A')?.postingMode).toBe('open')
    const view = await organizer().updateSettings({ postingMode: 'paused' })
    expect(store().doc('photoWall-conf-A')?.postingMode).toBe('paused')
    expect(view.wall?.postingMode).toBe('paused')
    const auto = await organizer().updateSettings({ postingMode: 'auto' })
    expect(store().doc('photoWall-conf-A')?.postingMode).toBe('auto')
    expect(auto.wall?.postingMode).toBe('auto')
    expect(auto.posting).toBe('open')
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

  it('refuses a mode the switch does not offer, and an empty change', async () => {
    await expect(
      organizer().updateSettings({ postingMode: 'always' as 'open' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(organizer().updateSettings({})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(store().commits).toEqual([])
  })
})

describe('organizers of the conference organization only (§10)', () => {
  beforeEach(() =>
    store().reset([
      wallOf('conf-A', { postingMode: 'paused' }),
      ...withPhoto(postOf('conf-A', 'p1', { status: 'pending' })),
    ]),
  )

  it.each([
    ['a speaker', () => caller('sp-ada')],
    ['an organizer of another organization', () => caller('sp-x', ['org-B'])],
  ])('refuses %s, writing nothing', async (_who, as) => {
    await expect(as().setUp()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      as().updateSettings({ postingMode: 'open' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(as().settings()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // Before any read: a refused caller learns nothing, not even a count.
    await expect(as().moderationQueue()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(store().reads).toEqual([])
    expect(store().commits).toEqual([])
    expect(store().doc('photoWall-conf-A')?.postingMode).toBe('paused')
  })
})

/** A stored Wall Post (§4.2) with its photo on `asset`. */
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
    status: 'pending',
    photo: {
      _type: 'image',
      asset: ref(`image-sha${uploadId}-1600x1000-jpg`),
    },
    crop: { x: 0.5, y: 0.5 },
    marketingConsent: false,
    deviceKey: 'device-hash',
    submittedAt: '2026-10-26T07:30:00Z',
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

describe('photoWall.moderationQueue (§8, §10)', () => {
  it('answers every post of the conference, with the photo as the card shows it', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(
        postOf('conf-A', 'a1', {
          _createdAt: '2026-10-26T07:30:01Z',
          caption: 'Keynote crowd',
          name: 'Ada',
          marketingConsent: true,
          crop: { x: 0.2, y: 0.5 },
        }),
      ),
      ...withPhoto(
        postOf('conf-A', 'a2', {
          status: 'approved',
          approvedAt: '2026-10-26T07:40:00Z',
          decidedAt: '2026-10-26T07:40:00Z',
        }),
        1200,
        1600,
      ),
    ])
    const queue = await organizer().moderationQueue()
    expect(queue.posts).toHaveLength(2)
    expect(queue.posts.find((p) => p._id === 'wallPost-a1')).toEqual({
      _id: 'wallPost-a1',
      status: 'pending',
      photo: {
        url: 'https://cdn.sanity.io/images/test/test/shaa1-1600x1000.jpg?w=1200&fit=max&auto=format',
        width: 1600,
        height: 1000,
      },
      crop: { x: 0.2, y: 0.5 },
      caption: 'Keynote crowd',
      name: 'Ada',
      marketingConsent: true,
      submittedAt: '2026-10-26T07:30:00Z',
      approvedAt: null,
      decidedAt: null,
      // Which post the card shows, sent back with every action.
      incarnation: {
        createdAt: '2026-10-26T07:30:01Z',
        assetId: 'image-shaa1-1600x1000-jpg',
      },
    })
    const a2 = queue.posts.find((p) => p._id === 'wallPost-a2')
    expect(a2).toMatchObject({
      status: 'approved',
      caption: null,
      name: null,
      marketingConsent: false,
      approvedAt: '2026-10-26T07:40:00Z',
      photo: { width: 1200, height: 1600 },
    })
    // The device key never reaches the browser.
    expect(a2).not.toHaveProperty('deviceKey')
  })

  it("never shows another conference's post", async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'a1')),
      ...withPhoto(postOf('conf-B', 'b1')),
      ...withPhoto(postOf('conf-B', 'b2', { status: 'approved' })),
    ])
    const queue = await organizer().moderationQueue()
    expect(queue.posts.map((p) => p._id)).toEqual(['wallPost-a1'])
  })

  it('a deleting post has no photo (§12)', async () => {
    store().reset([
      wallOf('conf-A'),
      postOf('conf-A', 'd1', {
        status: 'deleting',
        photo: undefined,
        deletingAssetId: 'image-shad1-1600x1000-jpg',
        caption: 'Gone soon',
      }),
    ])
    const queue = await organizer().moderationQueue()
    expect(queue.posts).toEqual([
      expect.objectContaining({
        _id: 'wallPost-d1',
        status: 'deleting',
        photo: null,
        caption: 'Gone soon',
      }),
    ])
    expect(queue.posts[0]).not.toHaveProperty('deletingAssetId')
    // Nor in what the card sends back: the asset id a Delete still holds.
    expect(queue.posts[0].incarnation).toEqual({
      createdAt: null,
      assetId: null,
    })
  })

  it('reads a post without consent or crop as no consent, centred (§4.2)', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(
        postOf('conf-A', 'n1', {
          marketingConsent: undefined,
          crop: undefined,
        }),
      ),
      ...withPhoto(postOf('conf-A', 'n2', { crop: { x: 0.1 } })),
    ])
    const queue = await organizer().moderationQueue()
    const byId = Object.fromEntries(queue.posts.map((p) => [p._id, p]))
    expect(byId['wallPost-n1']).toMatchObject({
      marketingConsent: false,
      crop: { x: 0.5, y: 0.5 },
    })
    expect(byId['wallPost-n2'].crop).toEqual({ x: 0.1, y: 0.5 })
  })

  it('never answers a draft, even one of this conference (§8)', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'a1')),
      {
        ...postOf('conf-A', 'a1'),
        _id: 'drafts.wallPost-a1',
        caption: 'Draft',
      },
      { ...postOf('conf-A', 'a2'), _id: 'drafts.wallPost-a2' },
    ])
    const queue = await organizer().moderationQueue()
    expect(queue.posts.map((p) => [p._id, p.caption])).toEqual([
      ['wallPost-a1', null],
    ])
  })

  it('a deleting post shows no photo even while its asset is still referenced (§12)', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'd2', { status: 'deleting' })),
    ])
    const queue = await organizer().moderationQueue()
    expect(queue.posts).toEqual([
      expect.objectContaining({
        _id: 'wallPost-d2',
        status: 'deleting',
        photo: null,
      }),
    ])
  })

  it('answers every status, the deleting post too', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'p1')),
      ...withPhoto(postOf('conf-A', 'p2')),
      ...withPhoto(postOf('conf-A', 'p3', { status: 'approved' })),
      ...withPhoto(postOf('conf-A', 'p4', { status: 'notShown' })),
      postOf('conf-A', 'p5', { status: 'deleting', photo: undefined }),
    ])
    const queue = await organizer().moderationQueue()
    expect(queue.posts.map((p) => [p._id, p.status])).toEqual(
      expect.arrayContaining([
        ['wallPost-p1', 'pending'],
        ['wallPost-p2', 'pending'],
        ['wallPost-p3', 'approved'],
        ['wallPost-p4', 'notShown'],
        ['wallPost-p5', 'deleting'],
      ]),
    )
    expect(queue.posts).toHaveLength(5)
  })

  it('is empty before any post', async () => {
    store().reset([wallOf('conf-A')])
    await expect(organizer().moderationQueue()).resolves.toEqual({
      posts: [],
    })
  })

  it('is cached per conference under the admin tag, default life (§8)', async () => {
    store().reset([wallOf('conf-A')])
    await organizer().moderationQueue()
    expect(h.cacheTag).toHaveBeenCalledWith('photo-wall-admin:conf-A')
    expect(h.cacheLife).toHaveBeenCalledWith('default')
  })

  it('reads on the non-CDN client (§8)', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    await organizer().moderationQueue()
    const reads = store().reads.filter((r) => r.query.includes('wallPost'))
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every((r) => r.client === 'uncached')).toBe(true)
  })

  it('polls without a live conference read: the cached tenant read only (§8)', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    // A live read that differs: a poll must not ask for it at all.
    cdn.live = { organization: { _ref: 'org-B' } }
    for (let poll = 0; poll < 3; poll++) {
      const queue = await organizer().moderationQueue()
      expect(queue.posts.map((p) => p._id)).toEqual(['wallPost-p1'])
    }
    const calls = vi.mocked(getConferenceForCurrentDomain).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter(([opts]) => opts?.uncached === true)).toEqual([])
  })

  it("answers the cached tenant's posts, not another conference's", async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'a1')),
      ...withPhoto(postOf('conf-Z', 'z1')),
    ])
    cdn.conference = { _id: 'conf-Z' }
    const queue = await organizer().moderationQueue()
    expect(queue.posts.map((p) => p._id)).toEqual(['wallPost-z1'])
  })

  it("refuses, reading no post, when the tenant read no longer names the waist's organization", async () => {
    // The authz waist resolved org-A; by the queue's own read the cached
    // conference belongs to org-B (it moved, and the cache caught up between
    // the two reads).
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    cdn.movedAfter = 1
    await expect(organizer().moderationQueue()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Could not resolve conference from domain',
    })
    // The waist's read and the queue's: the refusal is the queue's own check.
    expect(cdn.cachedReads).toBe(2)
    expect(store().reads.filter((r) => r.query.includes('wallPost'))).toEqual(
      [],
    )
  })
})

/**
 * What a card sends of the post it showed. The fixtures carry no
 * `_createdAt` and the card no photo id: the incarnation tests set both.
 */
const SHOWN = { createdAt: null, assetId: null }
const shownAll = (ids: string[]) => ids.map((id) => ({ id, ...SHOWN }))

describe('the moderation actions (§8, §10, §12)', () => {
  const P = 'wallPost-p1'
  const ASSET = 'image-shap1-1600x1000-jpg'
  const expired = () => h.revalidateTag.mock.calls
  const tags = (deviceKey = 'device-hash', wall = true) =>
    [
      ['photo-wall-admin:conf-A', { expire: 0 }],
      [`photo-wall-device:${deviceKey}`, { expire: 0 }],
      ...(wall ? [['photo-wall:conf-A', { expire: 0 }]] : []),
    ] as const

  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))

  it('Approve approves, and expires the queue, the device and the wall', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    await expect(
      organizer().approve({ id: P, from: 'pending', shown: SHOWN }),
    ).resolves.toEqual({ status: 'done' })
    expect(store().doc(P)).toMatchObject({ status: 'approved' })
    expect(expired()).toEqual(tags())
  })

  it('Reject rejects, and expires all three (every write does, §8)', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    await expect(organizer().reject({ id: P, shown: SHOWN })).resolves.toEqual({
      status: 'done',
    })
    expect(store().doc(P)).toMatchObject({ status: 'notShown' })
    expect(expired()).toEqual(tags())
  })

  it('Remove takes it off the wall, and expires all three', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'p1', { status: 'approved' })),
    ])
    await expect(organizer().remove({ id: P, shown: SHOWN })).resolves.toEqual({
      status: 'done',
    })
    expect(store().doc(P)).toMatchObject({ status: 'notShown' })
    expect(expired()).toEqual(tags())
  })

  it('Delete now deletes the post and its asset, and expires all three', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    await expect(
      organizer().deletePost({ id: P, shown: SHOWN }),
    ).resolves.toEqual({
      status: 'deleted',
    })
    expect(store().doc(P)).toBeUndefined()
    expect(store().doc(ASSET)).toBeUndefined()
    expect(expired()).toEqual(tags())
  })

  it('a Delete that stops at deleting still expires all three, and Try again finishes it', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    store().failReadsThat((read) => read.query.includes('references('))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      organizer().deletePost({ id: P, shown: SHOWN }),
    ).resolves.toEqual({
      status: 'failed',
    })
    expect(store().doc(P)).toMatchObject({ status: 'deleting' })
    expect(expired()).toEqual(tags())
    // The queue shows it in Not shown with no photo (M4a).
    const queue = await organizer().moderationQueue()
    expect(queue.posts).toEqual([
      expect.objectContaining({ _id: P, status: 'deleting', photo: null }),
    ])
    store().failReadsThat(() => false)
    await expect(
      organizer().deletePost({ id: P, shown: SHOWN }),
    ).resolves.toEqual({
      status: 'deleted',
    })
    expect(store().doc(ASSET)).toBeUndefined()
  })

  it('a refused action writes nothing, says the post changed, and still expires (every outcome)', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'p1', { status: 'approved' })),
    ])
    await expect(organizer().reject({ id: P, shown: SHOWN })).resolves.toEqual({
      status: 'changed',
    })
    await expect(
      organizer().approve({ id: P, from: 'pending', shown: SHOWN }),
    ).resolves.toEqual({ status: 'changed' })
    expect(store().commits).toEqual([])
    expect(expired()).toEqual([...tags(), ...tags()])
  })

  it("answers gone, writing nothing, for another conference's post, and expires only this wall's tags", async () => {
    store().reset([
      wallOf('conf-A'),
      // This conference's id everywhere but the reference.
      ...withPhoto(
        postOf('conf-B', 'p1', { deviceKey: 'conf-A', caption: 'conf-A' }),
      ),
    ])
    for (const call of [
      () => organizer().approve({ id: P, from: 'pending', shown: SHOWN }),
      () => organizer().reject({ id: P, shown: SHOWN }),
      () => organizer().remove({ id: P, shown: SHOWN }),
      () => organizer().deletePost({ id: P, shown: SHOWN }),
    ]) {
      h.revalidateTag.mockClear()
      await expect(call()).resolves.toEqual({ status: 'gone' })
      // Never the other conference's post's device.
      expect(expired().map(([tag]) => tag)).toEqual([
        'photo-wall-admin:conf-A',
        'photo-wall-device:',
        'photo-wall:conf-A',
      ])
    }
    expect(store().commits).toEqual([])
  })

  it.each([
    [
      'approve',
      () => organizer().approve({ id: P, from: 'pending', shown: SHOWN }),
      'pending',
    ],
    ['reject', () => organizer().reject({ id: P, shown: SHOWN }), 'pending'],
    ['remove', () => organizer().remove({ id: P, shown: SHOWN }), 'approved'],
  ] as const)(
    '%s: a patch that committed while its answer was lost: the error surfaces, and all three are expired',
    async (_name, call, status) => {
      store().reset([
        wallOf('conf-A'),
        ...withPhoto(postOf('conf-A', 'p1', { status })),
      ])
      store().afterNextCommit(() => {
        throw new Error('socket hang up')
      })
      await expect(call()).rejects.toThrow('socket hang up')
      expect(store().commits).toHaveLength(1)
      expect(expired()).toEqual(tags())
    },
  )

  it('a mark that committed while its answer was lost: the error surfaces, and the wall, queue and device are expired', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'p1', { status: 'approved' })),
    ])
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    await expect(
      organizer().deletePost({ id: P, shown: SHOWN }),
    ).rejects.toThrow('socket hang up')
    expect(store().doc(P)).toMatchObject({ status: 'deleting' })
    expect(expired()).toEqual(tags())
  })

  it.each([
    ['approve', 'changed'],
    ['reject', 'changed'],
    ['remove', 'changed'],
    ['deletePost', 'gone'],
  ] as const)(
    '%s from a STALE card: a replacement re-submitted under the id is not touched, and the device the action read is expired',
    async (name, answer) => {
      // The card showed the original; a replacement from another device
      // is stored under its id before the action's first read.
      store().reset([
        wallOf('conf-A'),
        ...withPhoto(
          postOf('conf-A', 'p1', {
            _createdAt: '2026-10-26T08:59:00Z',
            status: name === 'remove' ? 'approved' : 'pending',
            deviceKey: 'device-new',
          }),
        ),
      ])
      const original = {
        createdAt: '2026-10-26T07:30:00Z',
        assetId: 'image-shap1-1600x1000-jpg',
      }
      const call = {
        approve: () =>
          organizer().approve({ id: P, from: 'pending', shown: original }),
        reject: () => organizer().reject({ id: P, shown: original }),
        remove: () => organizer().remove({ id: P, shown: original }),
        deletePost: () => organizer().deletePost({ id: P, shown: original }),
      }[name]
      await expect(call()).resolves.toEqual({ status: answer })
      expect(store().commits).toEqual([])
      expect(expired()).toEqual(tags('device-new'))
    },
  )

  it('refuses an id that is not a Wall Post id, reading nothing', async () => {
    for (const id of ['wallPost-p1,wallPost-p2', 'drafts.wallPost-p1', 'x']) {
      await expect(
        organizer().deletePost({ id, shown: SHOWN }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    }
    expect(store().docReads).toEqual([])
  })

  describe('approveAllPending', () => {
    it('approves the pending posts, says how many, and expires each device once', async () => {
      store().reset([
        wallOf('conf-A'),
        ...withPhoto(postOf('conf-A', 'p1', { deviceKey: 'd1' })),
        ...withPhoto(postOf('conf-A', 'p2', { deviceKey: 'd1' })),
        ...withPhoto(postOf('conf-A', 'p3', { deviceKey: 'd2' })),
        ...withPhoto(postOf('conf-B', 'p4', { deviceKey: 'd3' })),
      ])
      // The organizer was shown all four ids; p4 is another conference's.
      const ids = ['wallPost-p1', 'wallPost-p2', 'wallPost-p3', 'wallPost-p4']
      await expect(
        organizer().approveAllPending({ shown: shownAll(ids) }),
      ).resolves.toEqual({
        approved: 3,
        pending: 3,
      })
      expect(store().doc('wallPost-p4')?.status).toBe('pending')
      const tagged = expired().map(([tag]) => tag)
      expect(new Set(tagged)).toEqual(
        new Set([
          'photo-wall-admin:conf-A',
          'photo-wall:conf-A',
          'photo-wall-device:d1',
          'photo-wall-device:d2',
        ]),
      )
      expect(tagged.filter((t) => t === 'photo-wall-device:d1')).toHaveLength(1)
    })

    it('approves only the posts the organizer was shown: one that arrived since stays pending', async () => {
      store().reset([
        wallOf('conf-A'),
        ...withPhoto(postOf('conf-A', 'p1')),
        ...withPhoto(postOf('conf-A', 'p2')),
      ])
      await expect(
        organizer().approveAllPending({ shown: shownAll(['wallPost-p1']) }),
      ).resolves.toEqual({ approved: 1, pending: 1 })
      expect(store().doc('wallPost-p1')?.status).toBe('approved')
      expect(store().doc('wallPost-p2')?.status).toBe('pending')
    })

    it('refuses more ids than the wall can hold pending, reading nothing', async () => {
      const ids = Array.from({ length: 201 }, (_, i) => `wallPost-p${i}`)
      await expect(
        organizer().approveAllPending({ shown: shownAll(ids) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(store().reads).toEqual([])
    })

    it('with nothing to approve, still expires the wall and the queue (every outcome)', async () => {
      store().reset([wallOf('conf-A')])
      await expect(
        organizer().approveAllPending({ shown: shownAll([P]) }),
      ).resolves.toEqual({
        approved: 0,
        pending: 0,
      })
      expect(expired().map(([tag]) => tag)).toEqual([
        'photo-wall-admin:conf-A',
        'photo-wall-device:',
        'photo-wall:conf-A',
      ])
    })

    it('a patch that committed while its answer was lost: not counted, but its device is expired too', async () => {
      store().reset([
        wallOf('conf-A'),
        ...withPhoto(postOf('conf-A', 'p1', { deviceKey: 'd1' })),
        ...withPhoto(
          postOf('conf-A', 'p2', {
            deviceKey: 'd2',
            submittedAt: '2026-10-26T07:40:00Z',
          }),
        ),
      ])
      store().afterNextCommit(() => {
        throw new Error('socket hang up')
      })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(
        organizer().approveAllPending({
          shown: shownAll(['wallPost-p1', 'wallPost-p2']),
        }),
      ).resolves.toEqual({ approved: 1, pending: 2 })
      expect(store().doc('wallPost-p1')?.status).toBe('approved')
      expect(new Set(expired().map(([tag]) => tag))).toEqual(
        new Set([
          'photo-wall-admin:conf-A',
          'photo-wall:conf-A',
          'photo-wall-device:d1',
          'photo-wall-device:d2',
        ]),
      )
    })
  })

  describe('organizers of the conference organization only', () => {
    const calls = (as: () => ReturnType<typeof caller>) => [
      () => as().approve({ id: P, from: 'pending', shown: SHOWN }),
      () => as().reject({ id: P, shown: SHOWN }),
      () => as().remove({ id: P, shown: SHOWN }),
      () => as().deletePost({ id: P, shown: SHOWN }),
      () => as().approveAllPending({ shown: shownAll([P]) }),
    ]

    it.each([
      ['a speaker', () => caller('sp-ada')],
      ['an organizer of another organization', () => caller('sp-x', ['org-B'])],
    ])('refuses %s, reading and writing nothing', async (_who, as) => {
      store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
      for (const call of calls(as)) {
        await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' })
      }
      expect(store().reads).toEqual([])
      expect(store().docReads).toEqual([])
      expect(store().commits).toEqual([])
      expect(store().doc(P)?.status).toBe('pending')
    })

    it('refuses, reading and writing nothing, when the conference has moved to another organization', async () => {
      store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
      cdn.live = { organization: { _ref: 'org-B' } }
      for (const call of calls(organizer)) {
        await expect(call()).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'Could not resolve conference from domain',
        })
      }
      expect(store().docReads).toEqual([])
      expect(store().reads.filter((r) => r.query.includes('wallPost'))).toEqual(
        [],
      )
      expect(store().commits).toEqual([])
      expect(expired()).toEqual([])
    })

    it.each([
      [
        'approve',
        () => organizer().approve({ id: P, from: 'pending', shown: SHOWN }),
      ],
      ['reject', () => organizer().reject({ id: P, shown: SHOWN })],
      ['remove', () => organizer().remove({ id: P, shown: SHOWN })],
      ['deletePost', () => organizer().deletePost({ id: P, shown: SHOWN })],
      [
        'approveAllPending',
        () => organizer().approveAllPending({ shown: shownAll([P]) }),
      ],
    ] as const)('%s reads the conference live', async (_name, call) => {
      store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
      vi.mocked(getConferenceForCurrentDomain).mockClear()
      await call()
      expect(
        vi
          .mocked(getConferenceForCurrentDomain)
          .mock.calls.some(([opts]) => opts?.uncached === true),
      ).toBe(true)
    })
  })

  it('pins the mutation surface: a new write is a deliberate act', () => {
    const mutations = Object.entries(
      photoWallRouter._def.procedures as Record<
        string,
        { _def?: { type?: string } }
      >,
    )
      .filter(([, p]) => p._def?.type === 'mutation')
      .map(([name]) => name)
      .sort()
    expect(mutations).toMatchInlineSnapshot(`
      [
        "approve",
        "approveAllPending",
        "deletePost",
        "reject",
        "remove",
        "setUp",
        "updateSettings",
      ]
    `)
  })
})

describe('photoWall.pendingCount (§10, P6: the admin nav badge)', () => {
  it('counts only the pending posts of this conference', async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'p1')),
      ...withPhoto(postOf('conf-A', 'p2')),
      ...withPhoto(postOf('conf-A', 'p3', { status: 'approved' })),
      ...withPhoto(postOf('conf-A', 'p4', { status: 'notShown' })),
      postOf('conf-A', 'p5', { status: 'deleting', photo: undefined }),
      // A draft of this conference is never a Wall Post (§8).
      { ...postOf('conf-A', 'p6'), _id: 'drafts.wallPost-p6' },
      // Another conference's pending post, carrying THIS conference's id in
      // every field but its reference: only a tenant predicate keeps it out.
      ...withPhoto(
        postOf('conf-B', 'conf-A', {
          name: 'conf-A',
          caption: 'conf-A',
          deviceKey: 'conf-A',
        }),
      ),
    ])
    await expect(organizer().pendingCount()).resolves.toBe(2)
  })

  it('is 0 before Set up and before any post', async () => {
    store().reset([...withPhoto(postOf('conf-B', 'b1'))])
    await expect(organizer().pendingCount()).resolves.toBe(0)
    store().reset([wallOf('conf-A')])
    await expect(organizer().pendingCount()).resolves.toBe(0)
  })

  it("counts the cached tenant's posts, never from a live conference read", async () => {
    store().reset([
      wallOf('conf-A'),
      ...withPhoto(postOf('conf-A', 'a1')),
      ...withPhoto(postOf('conf-Z', 'z1')),
      ...withPhoto(postOf('conf-Z', 'z2')),
    ])
    cdn.conference = { _id: 'conf-Z' }
    cdn.live = { _id: 'conf-A' }
    await expect(organizer().pendingCount()).resolves.toBe(2)
    const calls = vi.mocked(getConferenceForCurrentDomain).mock.calls
    expect(calls.filter(([opts]) => opts?.uncached === true)).toEqual([])
  })

  it('reads the moderation queue’s cache entry: one read per tag expiry, shared with the page (§8)', async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    await organizer().pendingCount()
    expect(h.cacheTag).toHaveBeenCalledWith('photo-wall-admin:conf-A')
    expect(h.cacheLife).toHaveBeenCalledWith('default')
    const reads = store().reads.filter((r) => r.query.includes('wallPost'))
    expect(reads.map((r) => r.client)).toEqual(['uncached'])
  })

  it.each([
    ['a speaker', () => caller('sp-ada')],
    ['an organizer of another organization', () => caller('sp-x', ['org-B'])],
  ])('refuses %s before any read', async (_who, as) => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    await expect(as().pendingCount()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(store().reads).toEqual([])
  })

  it("refuses, reading no post, when the tenant read no longer names the waist's organization", async () => {
    store().reset([wallOf('conf-A'), ...withPhoto(postOf('conf-A', 'p1'))])
    cdn.movedAfter = 1
    await expect(organizer().pendingCount()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(store().reads.filter((r) => r.query.includes('wallPost'))).toEqual(
      [],
    )
  })
})
