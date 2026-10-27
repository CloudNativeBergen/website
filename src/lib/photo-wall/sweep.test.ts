/**
 * @vitest-environment node
 *
 * The orphan sweep (Photo Wall spec §11.2, §14) on the versioned in-memory
 * store: the candidate query and the stuck-delete query EXECUTED as GROQ
 * with groq-js, the holder check on the latest documents, every write built
 * by the real `@sanity/client`, and a delete of a strongly referenced
 * document refused as Sanity refuses it.
 *
 * Adversarial fixture: an orphan too new to sweep, one of a purged wall, one
 * of a conference with no wall, a gallery upload, a sponsor logo, one a
 * draft holds, one only another tenant's document holds, one a marketing
 * asset holds on a purged wall, one the query view shows as free while the
 * document store holds it; a `deleting` post too new to finish, a pending
 * one, a draft.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  revalidateTag: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  STUCK_FINISH_MS,
  SWEEP_AGE_MS,
  sweepPhotoWall,
  type SweepReport,
} from './sweep'
import { runPhotoWallRetention } from './retention'

type Doc = Record<string, unknown> & { _id: string }
const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const NOW = new Date('2026-10-26T10:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const HOUR = SWEEP_AGE_MS

const wall = (conferenceId: string, fields: Record<string, unknown> = {}) => ({
  _id: `photoWall-${conferenceId}`,
  _type: 'photoWall',
  _rev: 'r',
  conference: ref(conferenceId),
  ...fields,
})
const assetId = (n: string) => `image-${n}-1600x1000-jpg`
const asset = (
  n: string,
  createdAt: string,
  source: { name: string; id: string } | null = {
    name: 'photo-wall',
    id: 'conf-A',
  },
): Doc => ({
  _id: assetId(n),
  _type: 'sanity.imageAsset',
  _rev: `rev-${n}`,
  _createdAt: createdAt,
  ...(source ? { source } : {}),
})
const postId = (n: string) =>
  `wallPost-${n.padStart(8, '0')}-0000-4000-8000-000000000000`
const post = (
  n: string,
  conferenceId: string,
  fields: Record<string, unknown> = {},
): Doc => ({
  _id: postId(n),
  _type: 'wallPost',
  _rev: `rev-${n}`,
  conference: ref(conferenceId),
  status: 'pending',
  deviceKey: `device-${n}`,
  submittedAt: ago(3 * HOUR),
  _createdAt: ago(3 * HOUR),
  _updatedAt: ago(3 * HOUR),
  ...fields,
})
const holding = (n: string, assetN: string, conferenceId = 'conf-A') =>
  post(n, conferenceId, {
    photo: { _type: 'image', asset: ref(assetId(assetN)) },
  })

/** A gallery item that deduplicated onto a Wall photo (`createdByUpload: false`). */
const marketing = (id: string, assetN: string): Doc => ({
  _id: id,
  _type: 'marketingAsset',
  _rev: 'r',
  organization: ref('org-a'),
  kind: 'image',
  image: { _type: 'image', asset: ref(assetId(assetN)) },
  files: [
    {
      _key: 'k',
      assetId: assetId(assetN),
      type: 'image',
      createdByUpload: false,
    },
  ],
})

const fixture = (): Doc[] => [
  wall('conf-A'),
  wall('conf-B'),
  wall('conf-C', { purgedAt: '2026-10-01T00:00:00Z' }),
  // Orphans of conf-A: swept, too new, and held in every way.
  asset('o1', ago(2 * HOUR)),
  asset('o2', ago(HOUR - 1000)),
  asset('o3', ago(2 * HOUR)),
  holding('h3', 'o3'),
  // Held only by another tenant's sponsor: passes the conference's count.
  asset('o4', ago(2 * HOUR)),
  {
    _id: 'sponsor-x',
    _type: 'sponsor',
    _rev: 'r',
    conference: ref('conf-B'),
    logo: { _type: 'image', asset: ref(assetId('o4')) },
  },
  // A purged wall's leftover, a gallery upload, one a draft holds.
  asset('o5', ago(2 * HOUR), { name: 'photo-wall', id: 'conf-C' }),
  asset('o6', ago(2 * HOUR), { name: 'gallery', id: 'conf-A' }),
  // A sponsor logo upload: no source at all, and nothing holds it.
  asset('o11', ago(2 * HOUR), null),
  // An upload of a conference that has no wall document (any more).
  asset('o9', ago(2 * HOUR), { name: 'photo-wall', id: 'conf-Z' }),
  // A purged wall's photo an organizer re-uploaded to the gallery: the
  // purge kept it, and the marketing asset still holds it.
  asset('o10', ago(2 * HOUR), { name: 'photo-wall', id: 'conf-C' }),
  marketing('m10', 'o10'),
  asset('o7', ago(2 * HOUR)),
  { ...holding('h7', 'o7'), _id: `drafts.${postId('h7')}` },
  // The other conference's own orphan.
  asset('o8', ago(2 * HOUR), { name: 'photo-wall', id: 'conf-B' }),
  // Stuck deletes: one of each conference, one too new, a draft. Their
  // assets are held by a plain string only, so they are orphans to the
  // asset pass too; uploaded under an hour ago here, so that pass leaves
  // them and the stuck-delete pass is what deletes them.
  post('d1', 'conf-A', {
    status: 'deleting',
    deletingAssetId: assetId('x1'),
    _updatedAt: ago(HOUR + 1000),
    talk: { _type: 'reference', _ref: 'talk-1', _weak: true },
  }),
  asset('x1', ago(HOUR - 1000)),
  post('d2', 'conf-A', {
    status: 'deleting',
    deletingAssetId: assetId('x2'),
    _updatedAt: ago(HOUR - 1000),
  }),
  asset('x2', ago(HOUR - 1000)),
  post('d3', 'conf-B', {
    status: 'deleting',
    deletingAssetId: assetId('x3'),
    _updatedAt: ago(2 * HOUR),
  }),
  asset('x3', ago(HOUR - 1000), { name: 'photo-wall', id: 'conf-B' }),
  {
    ...post('d4', 'conf-A', { status: 'deleting', _updatedAt: ago(2 * HOUR) }),
    _id: `drafts.${postId('d4')}`,
  },
]

const run = (deadline = new Date(NOW.getTime() + 290_000)) =>
  sweepPhotoWall({ now: NOW, deadline })

const deletedIds = () =>
  store()
    .commits.flat()
    .flatMap((m) => ('delete' in m ? [m.delete.id] : []))

/** The store's raw `mutate`, as the deletes call it. */
interface Mutator {
  mutate: (mutations: { delete?: { id: string } }[]) => Promise<unknown>
}

const nothing: SweepReport = {
  orphans: 0,
  assets: 0,
  assetsKept: 0,
  assetsFailed: 0,
  stuck: 0,
  finished: 0,
  finishFailed: 0,
  finishCutOff: 0,
  cutShort: false,
}

beforeEach(() => {
  store().reset(fixture())
  h.revalidateTag.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('orphan assets (§11.2)', () => {
  it('deletes, with history, EVERY photo-wall asset older than an hour that nothing references: of a live wall, a purged wall, or a conference with no wall', async () => {
    const report = await run()
    expect(report).toMatchObject({ orphans: 4, assets: 4, assetsKept: 0 })
    for (const n of ['o1', 'o8', 'o5', 'o9'])
      expect(store().doc(assetId(n))).toBeUndefined()
    expect(
      store()
        .commits.flat()
        .filter((m) => 'delete' in m && m.delete.id === assetId('o5')),
    ).toEqual([{ delete: { id: assetId('o5'), purge: true } }])
    expect(
      store()
        .commits.flat()
        .filter((m) => 'delete' in m && m.delete.id === assetId('o1')),
    ).toEqual([{ delete: { id: assetId('o1'), purge: true } }])
  })

  it('keeps one younger than an hour, a gallery upload, a sponsor logo, and one a post, a draft or a marketing asset holds', async () => {
    await run()
    for (const n of ['o2', 'o3', 'o6', 'o7', 'o10', 'o11']) {
      expect(store().doc(assetId(n))).toBeDefined()
      expect(deletedIds()).not.toContain(assetId(n))
    }
  })

  it("is never a candidate when a document holds it, another tenant's or on a purged wall: not checked, not counted, not tried", async () => {
    const mutate = vi.spyOn(clientWrite as unknown as Mutator, 'mutate')
    const report = await run()
    expect(report).toMatchObject({ orphans: 4, assetsKept: 0 })
    for (const n of ['o4', 'o10']) {
      expect(store().doc(assetId(n))).toBeDefined()
      // No holder check of it: the candidate read already left it out, so
      // a growing set of held uploads never takes the run's time.
      expect(
        store().reads.filter((r) => r.params.assetId === assetId(n)),
      ).toEqual([])
      expect(
        mutate.mock.calls.flatMap(([m]) =>
          m.flatMap((x) => (x.delete ? [x.delete.id] : [])),
        ),
      ).not.toContain(assetId(n))
    }
  })

  it('rechecks on the latest documents: a holder that appears after the candidate read keeps the asset, untried', async () => {
    store().beforeEachRead((read) => {
      // o1's own check: after the candidate read named it.
      if (
        read.query.includes('references($assetId)') &&
        read.params.assetId === assetId('o1')
      ) {
        store().put(holding('late', 'o1'))
      }
    })
    const report = await run()
    expect(report).toMatchObject({ orphans: 4, assets: 3, assetsKept: 1 })
    expect(store().doc(assetId('o1'))).toBeDefined()
    expect(deletedIds()).not.toContain(assetId('o1'))
  })

  it('never deletes an asset a document holds that the query view does not show yet: Sanity refuses, and it is reported', async () => {
    store().put(holding('unseen', 'o1'))
    store().readsLagFor(postId('unseen'), null)
    const report = await run()
    expect(report).toMatchObject({ assets: 3, assetsFailed: 1 })
    expect(store().doc(assetId('o1'))).toBeDefined()
  })
})

describe('stuck deletes (§11.2, §12)', () => {
  it('finishes a deleting post older than an hour, of any conference: its asset and the post go, and its caches expire', async () => {
    const report = await run()
    expect(report).toMatchObject({ stuck: 2, finished: 2, finishFailed: 0 })
    for (const n of ['d1', 'd3']) expect(store().doc(postId(n))).toBeUndefined()
    for (const n of ['x1', 'x3'])
      expect(store().doc(assetId(n))).toBeUndefined()
    const tags = h.revalidateTag.mock.calls.map(([tag]) => tag)
    expect(tags).toEqual(
      expect.arrayContaining([
        'photo-wall-admin:conf-A',
        'photo-wall-device:device-d1',
        // Its talk's photos (Talk photos spec §8).
        'photo-wall-talk:talk-1',
        'photo-wall-admin:conf-B',
        'photo-wall-device:device-d3',
      ]),
    )
    expect(tags).not.toContain('photo-wall:conf-A')
  })

  it('leaves a deleting post younger than an hour, a pending post and a draft alone', async () => {
    store().put(holding('p1', 'o3'))
    await run()
    expect(store().doc(postId('d2'))).toMatchObject({ status: 'deleting' })
    expect(store().doc(assetId('x2'))).toBeDefined()
    expect(store().doc(postId('p1'))).toBeDefined()
    expect(store().doc(`drafts.${postId('d4')}`)).toBeDefined()
  })

  it('a finish that fails is counted, and the next post is still tried', async () => {
    store().failReadsThat(
      (read) =>
        read.query.includes('references($assetId)') &&
        read.params.assetId === assetId('x1'),
    )
    const report = await run()
    expect(report).toMatchObject({ stuck: 2, finished: 1, finishFailed: 1 })
    expect(store().doc(postId('d1'))).toMatchObject({ status: 'deleting' })
    expect(store().doc(postId('d3'))).toBeUndefined()
  })
})

it('stops at the deadline, saying so', async () => {
  const report = await run(NOW)
  // Cut at the first stuck delete: no candidate is read.
  expect(report).toEqual({ ...nothing, stuck: 2, cutShort: true })
  expect(store().commits).toEqual([])
})

it('finishes the stuck deletes FIRST: an orphan pass past the deadline does not starve them', async () => {
  const deadline = new Date(NOW.getTime() + 60_000)
  // The deadline passes as the first orphan candidates are read.
  store().beforeEachRead((read) => {
    if (read.query.includes('"sanity.imageAsset"')) {
      vi.setSystemTime(new Date(deadline.getTime() + 1))
    }
  })
  const report = await run(deadline)
  expect(report).toMatchObject({
    stuck: 2,
    finished: 2,
    assets: 0,
    cutShort: true,
  })
  for (const n of ['d1', 'd3']) expect(store().doc(postId(n))).toBeUndefined()
  expect(store().doc(assetId('o1'))).toBeDefined()
})

describe('a stuck delete replaced under its id (§6.2, §12)', () => {
  it('a new post a retried submit created under the same id, after the candidate read, is left alone with its asset', async () => {
    const reader = clientReadUncached as unknown as {
      getDocument: (id: string) => Promise<unknown>
    }
    const getDocument = reader.getDocument.bind(reader)
    let replaced = false
    vi.spyOn(reader, 'getDocument').mockImplementation(async (id) => {
      if (id === postId('d3') && !replaced) {
        replaced = true
        // An organizer finished d3's delete; the contributor's retry, its
        // first answer lost, created the post anew under the same id.
        store().remove(postId('d3'))
        store().remove(assetId('x3'))
        store().put(
          asset('y3', ago(1000), { name: 'photo-wall', id: 'conf-B' }),
        )
        store().put({
          ...holding('d3', 'y3', 'conf-B'),
          _createdAt: ago(1000),
          _updatedAt: ago(1000),
        })
      }
      return getDocument(id)
    })
    await run()
    expect(replaced).toBe(true)
    expect(store().doc(postId('d3'))).toMatchObject({
      status: 'pending',
      photo: { asset: ref(assetId('y3')) },
    })
    expect(store().doc(assetId('y3'))).toBeDefined()
    expect(deletedIds()).not.toContain(postId('d3'))
    expect(deletedIds()).not.toContain(assetId('y3'))
  })
})

describe('a stuck delete that hangs (§11.2): bounded from the sweep', () => {
  it('is cut off after STUCK_FINISH_MS, counted as cut off (tried again tomorrow), and the sweep goes on', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(NOW)
    // d1's finish never gets an answer to its holder check of x1.
    store().beforeEachRead((read) =>
      read.params.assetId === assetId('x1') ? new Promise(() => {}) : undefined,
    )
    const sweeping = run()
    await vi.advanceTimersByTimeAsync(STUCK_FINISH_MS)
    const report = await sweeping
    expect(report).toMatchObject({
      stuck: 2,
      finished: 1,
      finishFailed: 0,
      finishCutOff: 1,
      // The orphan pass still ran.
      assets: 4,
    })
    expect(store().doc(postId('d3'))).toBeUndefined()
    // Resumable: still deleting, its asset id kept.
    expect(store().doc(postId('d1'))).toMatchObject({
      status: 'deleting',
      deletingAssetId: assetId('x1'),
    })
  })

  it('is not started when less than STUCK_FINISH_MS is left before the deadline', async () => {
    const report = await run(new Date(NOW.getTime() + STUCK_FINISH_MS - 1))
    expect(report).toEqual({ ...nothing, stuck: 2, cutShort: true })
    expect(store().commits).toEqual([])
  })
})

describe('an asset the purge kept, released after purgedAt (§11.1, §11.2)', () => {
  it('a Wall photo re-uploaded to the gallery is kept by the purge, and swept the run after the gallery item is deleted', async () => {
    // CND ends 27 Oct, so its deletion date is 26 Nov; closed the day before.
    const deletionRun = new Date('2026-11-26T03:10:00.000Z')
    store().reset([
      {
        _id: 'conf-E',
        _type: 'conference',
        _rev: 'r',
        title: 'conf-E',
        endDate: '2026-10-27',
      },
      wall('conf-E', { closedAt: '2026-11-25T03:10:00.000Z' }),
      holding('e1', 'w1', 'conf-E'),
      asset('w1', '2026-10-26T07:30:00.000Z', {
        name: 'photo-wall',
        id: 'conf-E',
      }),
      // Identical bytes: Sanity deduplicated the gallery upload onto it.
      marketing('m1', 'w1'),
    ])
    vi.setSystemTime(deletionRun)
    const purge = await runPhotoWallRetention({
      now: deletionRun,
      deadline: new Date(deletionRun.getTime() + 290_000),
    })
    expect(purge).toMatchObject({ purged: 1, posts: 1, assetsKept: 1 })
    expect(store().doc('photoWall-conf-E')).toMatchObject({
      purgedAt: deletionRun.toISOString(),
    })
    expect(store().doc(postId('e1'))).toBeUndefined()
    expect(store().doc(assetId('w1'))).toBeDefined()

    // The gallery item is deleted: `createdByUpload: false`, so the
    // gallery leaves the file alone.
    store().remove('m1')
    const nextRun = new Date('2026-11-27T03:10:00.000Z')
    vi.setSystemTime(nextRun)
    const report = await sweepPhotoWall({
      now: nextRun,
      deadline: new Date(nextRun.getTime() + 290_000),
    })
    expect(report).toMatchObject({ orphans: 1, assets: 1, assetsKept: 0 })
    expect(store().doc(assetId('w1'))).toBeUndefined()
    expect(
      store()
        .commits.flat()
        .filter((m) => 'delete' in m && m.delete.id === assetId('w1')),
    ).toEqual([{ delete: { id: assetId('w1'), purge: true } }])
  })
})
