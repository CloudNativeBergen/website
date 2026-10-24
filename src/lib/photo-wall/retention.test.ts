/**
 * @vitest-environment node
 *
 * The 30-day deletion (Photo Wall spec §11.1, §12, §14) on the versioned
 * in-memory store: every read EXECUTED as GROQ with groq-js (the walls due,
 * the posts of a conference, the conference's assets, the holders of each
 * asset), every write built by the real `@sanity/client` and the raw purge
 * mutation kept as written. A delete of a strongly referenced document is
 * refused as Sanity refuses it.
 *
 * Adversarial fixture: another conference's wall that is not due, a purged
 * wall, a wall whose conference has no end date, a draft wall; the due
 * conference's assets shared with the other conference's post and with a
 * sponsor of another tenant, an orphan asset of each conference, a gallery
 * asset of the due conference, and a document of another type on the due
 * conference with a photo. Each would be deleted, or kept, wrongly if the
 * tenant or type predicate were dropped.
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

import { clientWrite } from '@/lib/sanity/client'
import { deleteWallPost } from './delete'
import {
  CLOSE_SETTLE_MS,
  POST_DELETE_CHUNK,
  runPhotoWallRetention,
  type RetentionReport,
} from './retention'

type Doc = Record<string, unknown> & { _id: string }
const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** Oslo 04:10 on each day the cron runs (03:10 UTC). */
const at = (day: string) => new Date(`${day}T03:10:00.000Z`)
/** CND 2026 ends 27 Oct: its deletion date is 26 Nov (§11.1). */
const DAY_BEFORE = '2026-11-25'
const DELETION_DAY = '2026-11-26'

const conference = (id: string, endDate: string | null): Doc => ({
  _id: id,
  _type: 'conference',
  _rev: 'r',
  title: id,
  ...(endDate ? { endDate } : {}),
})
const wall = (conferenceId: string, fields: Record<string, unknown> = {}) => ({
  _id: `photoWall-${conferenceId}`,
  _type: 'photoWall',
  _rev: `rev-wall-${conferenceId}`,
  conference: ref(conferenceId),
  postingMode: 'paused',
  ...fields,
})
const postId = (n: string) =>
  `wallPost-${n.padStart(8, '0')}-0000-4000-8000-000000000000`
const post = (
  n: string,
  conferenceId: string,
  assetId: string | null,
  fields: Record<string, unknown> = {},
): Doc => ({
  _id: postId(n),
  _type: 'wallPost',
  _rev: `rev-${n}`,
  conference: ref(conferenceId),
  status: 'approved',
  ...(assetId ? { photo: { _type: 'image', asset: ref(assetId) } } : {}),
  caption: 'Keynote',
  deviceKey: `device-${n}`,
  submittedAt: '2026-10-26T07:30:00Z',
  ...fields,
})
const asset = (id: string, source?: { name: string; id: string }): Doc => ({
  _id: `image-${id}-1600x1000-jpg`,
  _type: 'sanity.imageAsset',
  _rev: `rev-${id}`,
  _createdAt: '2026-10-26T07:30:00Z',
  ...(source ? { source } : {}),
})
const assetId = (id: string) => `image-${id}-1600x1000-jpg`
const A = (n: string) => postId(`a${n}`)

const fixture = (): Doc[] => [
  conference('conf-A', '2026-10-27'),
  conference('conf-B', '2026-12-01'),
  conference('conf-C', '2026-09-01'),
  conference('conf-D', null),
  wall('conf-A'),
  // Not due until 31 December.
  wall('conf-B'),
  // Done already.
  wall('conf-C', {
    closedAt: '2026-10-01T03:10:00Z',
    purgedAt: '2026-10-02T03:10:00Z',
  }),
  // No end date: never due.
  wall('conf-D'),
  // A draft wall is not a wall.
  { ...wall('conf-A'), _id: 'drafts.photoWall-conf-A' },
  // The due conference's posts, one in every status and a draft.
  post('a1', 'conf-A', assetId('s1')),
  post('a2', 'conf-A', assetId('s2'), { status: 'pending' }),
  post('a3', 'conf-A', assetId('s3'), { status: 'notShown' }),
  post('a4', 'conf-A', null, {
    status: 'deleting',
    deletingAssetId: assetId('s4'),
  }),
  post('a5', 'conf-A', assetId('s5'), { deviceKey: 'device-a1' }),
  { ...post('a6', 'conf-A', assetId('s6')), _id: `drafts.${A('6')}` },
  // The other conference's post shares s2; its own s11.
  post('b1', 'conf-B', assetId('s2')),
  post('b2', 'conf-B', assetId('s11')),
  // Another type on the due conference, with a photo.
  {
    ...post('f1', 'conf-A', assetId('s10')),
    _type: 'feedbackResponse',
  },
  // A sponsor of another tenant holds s3 (the same bytes).
  {
    _id: 'sponsor-x',
    _type: 'sponsor',
    _rev: 'r',
    conference: ref('conf-B'),
    logo: { _type: 'image', asset: ref(assetId('s3')) },
  },
  ...['s1', 's2', 's3', 's4', 's5', 's6', 's10', 's11'].map((id) =>
    asset(id, { name: 'photo-wall', id: id === 's11' ? 'conf-B' : 'conf-A' }),
  ),
  // Orphans: one of each conference, and a gallery upload of the due one.
  asset('s7', { name: 'photo-wall', id: 'conf-A' }),
  asset('s8', { name: 'photo-wall', id: 'conf-B' }),
  asset('s9', { name: 'gallery', id: 'conf-A' }),
]

const run = (now: Date, deadline = new Date(now.getTime() + 290_000)) =>
  runPhotoWallRetention({ now, deadline })

const deletes = () =>
  store()
    .commits.flat()
    .flatMap((m) => ('delete' in m ? [m.delete] : []))
const deletedIds = () => deletes().map((d) => d.id)
const patches = () =>
  store()
    .commits.flat()
    .flatMap((m) => ('patch' in m ? [m.patch] : []))

const closedYesterday = () =>
  store().put(wall('conf-A', { closedAt: at(DAY_BEFORE).toISOString() }))

type Mutations = { delete?: { id: string } }[]
type MutateOptions = { signal?: AbortSignal } | undefined
/** The store's raw `mutate`, as the purge calls it. */
interface Mutator {
  mutate: (mutations: Mutations, options?: MutateOptions) => Promise<unknown>
}

/**
 * Send every raw `mutate` through `through`: the writer's own, and that of
 * every writer `withConfig` makes (the purge writes at the releases API
 * version). Answers every batch of mutations sent, in order.
 */
const onMutate = (
  through: (
    mutations: Mutations,
    options: MutateOptions,
    real: Mutator['mutate'],
  ) => Promise<unknown> = (m, o, real) => real(m, o),
) => {
  const writer = clientWrite as unknown as Mutator & {
    withConfig: (config: { apiVersion: string }) => Mutator
  }
  const sent: Mutations[] = []
  const wrap = (target: Mutator) => {
    const real = target.mutate.bind(target)
    return (m: Mutations, o?: MutateOptions) => {
      sent.push(m)
      return through(m, o, real)
    }
  }
  const withConfig = writer.withConfig.bind(writer)
  vi.spyOn(writer, 'withConfig').mockImplementation((config) => {
    const configured = withConfig(config)
    configured.mutate = wrap(configured)
    return configured
  })
  // Wrapped BEFORE the spy is installed, so it calls the real one.
  const own = wrap(writer)
  vi.spyOn(writer, 'mutate').mockImplementation(own)
  return sent
}

const nothing: RetentionReport = {
  due: 0,
  closed: 0,
  purged: 0,
  posts: 0,
  assets: 0,
  assetsKept: 0,
  unfinished: [],
  notReached: 0,
}

beforeEach(() => {
  store().reset(fixture())
  h.revalidateTag.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const clock = (now: Date) => {
  vi.setSystemTime(now)
  return now
}

describe('which walls are due (§11.1)', () => {
  it('two days before the deletion date, nothing is due and nothing is written', async () => {
    await expect(run(clock(at('2026-11-24')))).resolves.toEqual(nothing)
    expect(store().commits).toEqual([])
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })

  it('never a purged wall, a wall without an end date, a draft, or one not yet due', async () => {
    // Long past every deletion date: only conf-A is due. conf-C is
    // purged, conf-D has no end date, the draft is not a wall, conf-B is
    // due on 31 December.
    const report = await run(clock(at('2026-12-15')))
    expect(report).toMatchObject({ due: 1, closed: 1, purged: 0 })
    expect(patches().map((p) => p.id)).toEqual(['photoWall-conf-A'])
  })

  it('on 31 December, the other conference is due too', async () => {
    const report = await run(clock(at('2026-12-31')))
    expect(report).toMatchObject({ due: 2, closed: 2 })
    expect(
      patches()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['photoWall-conf-A', 'photoWall-conf-B'])
  })
})

describe('step 1: close the day before (§11.1)', () => {
  it('sets closedAt if unset, expires the wall and the queue, and deletes nothing', async () => {
    const now = clock(at(DAY_BEFORE))
    await expect(run(now)).resolves.toEqual({
      ...nothing,
      due: 1,
      closed: 1,
    })
    expect(store().commits).toEqual([
      [
        {
          patch: {
            id: 'photoWall-conf-A',
            setIfMissing: { closedAt: now.toISOString() },
          },
        },
      ],
    ])
    expect(store().doc('photoWall-conf-A')).toMatchObject({
      closedAt: now.toISOString(),
    })
    expect(store().doc('photoWall-conf-A')).not.toHaveProperty('purgedAt')
    expect(h.revalidateTag.mock.calls.map(([tag]) => tag).sort()).toEqual([
      'photo-wall-admin:conf-A',
      'photo-wall-device:',
      'photo-wall:conf-A',
    ])
  })

  it('keeps a closedAt already set (a second run the same day writes nothing)', async () => {
    closedYesterday()
    await expect(run(clock(at(DAY_BEFORE)))).resolves.toEqual({
      ...nothing,
      due: 1,
    })
    expect(store().commits).toEqual([])
    expect(store().doc('photoWall-conf-A')).toMatchObject({
      closedAt: at(DAY_BEFORE).toISOString(),
    })
  })

  it('on the deletion date, a wall not yet closed is closed and NOT purged: a submit may be in flight', async () => {
    const report = await run(clock(at(DELETION_DAY)))
    expect(report).toMatchObject({ due: 1, closed: 1, purged: 0, posts: 0 })
    expect(deletes()).toEqual([])
    expect(store().doc(A('1'))).toBeDefined()
  })

  it('a wall closed less than 15 minutes ago is not purged', async () => {
    const now = clock(at(DELETION_DAY))
    store().put(
      wall('conf-A', {
        closedAt: new Date(now.getTime() - CLOSE_SETTLE_MS).toISOString(),
      }),
    )
    const report = await run(now)
    expect(report).toMatchObject({ due: 1, closed: 0, purged: 0 })
    expect(store().commits).toEqual([])
    // One second more: purged.
    store().put(
      wall('conf-A', {
        closedAt: new Date(
          now.getTime() - CLOSE_SETTLE_MS - 1000,
        ).toISOString(),
      }),
    )
    await expect(run(now)).resolves.toMatchObject({ purged: 1 })
  })

  it('the day before the deletion date, a wall closed long ago is still not purged', async () => {
    store().put(wall('conf-A', { closedAt: '2026-11-20T03:10:00Z' }))
    await expect(run(clock(at(DAY_BEFORE)))).resolves.toEqual({
      ...nothing,
      due: 1,
    })
    expect(store().commits).toEqual([])
    expect(store().doc(A('1'))).toBeDefined()
  })

  it('Delete stays allowed on a closed wall', async () => {
    closedYesterday()
    await expect(
      deleteWallPost({ conferenceId: 'conf-A', postId: A('1') }),
    ).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(A('1'))).toBeUndefined()
    expect(store().doc(assetId('s1'))).toBeUndefined()
  })
})

describe('steps 3 and 4: the purge on the deletion date (§11.1, §12)', () => {
  beforeEach(closedYesterday)

  it('step a: ONE transaction marks every post of the chunk deleting, its asset id kept, photo unset', async () => {
    await run(clock(at(DELETION_DAY)))
    const marked = (id: string, assetId: string | null) => ({
      patch: assetId
        ? {
            id,
            set: { status: 'deleting', deletingAssetId: assetId },
            unset: ['photo'],
          }
        : { id, set: { status: 'deleting' } },
    })
    expect(store().commits[0]).toEqual([
      marked(A('1'), assetId('s1')),
      marked(A('2'), assetId('s2')),
      marked(A('3'), assetId('s3')),
      // Already deleting: its deletingAssetId stays.
      marked(A('4'), null),
      marked(A('5'), assetId('s5')),
      marked(`drafts.${A('6')}`, assetId('s6')),
    ])
  })

  it('step b: ONE transaction deletes the assets only the chunk held, then its posts, every delete with its history', async () => {
    await run(clock(at(DELETION_DAY)))
    const purged = (id: string) => ({ delete: { id, purge: true } })
    expect(store().commits[1]).toEqual([
      // Not s2 (the other conference's post) nor s3 (the sponsor).
      purged(assetId('s1')),
      purged(assetId('s4')),
      purged(assetId('s5')),
      purged(assetId('s6')),
      purged(A('1')),
      purged(A('2')),
      purged(A('3')),
      purged(A('4')),
      purged(A('5')),
      purged(`drafts.${A('6')}`),
    ])
    for (const id of [A('1'), A('2'), A('3'), A('4'), A('5')]) {
      expect(store().doc(id)).toBeUndefined()
    }
    expect(store().doc(`drafts.${A('6')}`)).toBeUndefined()
  })

  it('then the assets the posts referenced (deletingAssetId included), with history, and the orphan of the conference', async () => {
    const report = await run(clock(at(DELETION_DAY)))
    // Kept: s2 (the other conference's post), s3 (the sponsor) and s10
    // (the feedback document's photo, uploaded as a photo-wall asset).
    expect(report).toEqual({
      ...nothing,
      due: 1,
      purged: 1,
      posts: 6,
      assets: 5,
      assetsKept: 3,
    })
    const gone = ['s1', 's4', 's5', 's6', 's7']
    for (const id of gone) expect(store().doc(assetId(id))).toBeUndefined()
    expect(
      deletes()
        .filter((d) => d.id.startsWith('image-'))
        .map((d) => d.purge),
    ).toEqual(gone.map(() => true))
  })

  it("keeps an asset another conference's post or another tenant's sponsor holds, without trying the delete", async () => {
    const sent = onMutate()
    await run(clock(at(DELETION_DAY)))
    expect(store().doc(assetId('s2'))).toBeDefined()
    expect(store().doc(assetId('s3'))).toBeDefined()
    // Not even sent: the holder check kept them, not Sanity's refusal.
    const tried = sent.flatMap((m) =>
      m.flatMap((x) => (x.delete ? [x.delete.id] : [])),
    )
    // The spy saw the purge's deletes: an empty list would prove nothing.
    expect(tried).toContain(assetId('s1'))
    expect(tried).not.toContain(assetId('s2'))
    expect(tried).not.toContain(assetId('s3'))
    expect(store().doc(postId('b1'))).toMatchObject({
      photo: { asset: ref(assetId('s2')) },
    })
    expect(store().doc('sponsor-x')).toBeDefined()
  })

  it('touches nothing of another conference, another type, or another upload source', async () => {
    await run(clock(at(DELETION_DAY)))
    for (const id of [postId('b1'), postId('b2'), postId('f1')]) {
      expect(store().doc(id)).toBeDefined()
    }
    // b2's own asset, the other conference's orphan, the feedback photo,
    // the gallery upload.
    for (const id of ['s11', 's8', 's10', 's9']) {
      expect(store().doc(assetId(id))).toBeDefined()
    }
    expect(deletedIds().filter((id) => !id.startsWith('image-'))).toEqual([
      A('1'),
      A('2'),
      A('3'),
      A('4'),
      A('5'),
      `drafts.${A('6')}`,
    ])
    expect(store().doc('photoWall-conf-B')).not.toHaveProperty('purgedAt')
  })

  it('sets purgedAt LAST, and expires the wall, the queue and every device of the posts', async () => {
    const now = clock(at(DELETION_DAY))
    await run(now)
    const last = store().commits[store().commits.length - 1]
    expect(last).toEqual([
      {
        patch: { id: 'photoWall-conf-A', set: { purgedAt: now.toISOString() } },
      },
    ])
    expect(store().doc('photoWall-conf-A')).toMatchObject({
      closedAt: at(DAY_BEFORE).toISOString(),
      purgedAt: now.toISOString(),
    })
    const tags = new Set(h.revalidateTag.mock.calls.map(([tag]) => tag))
    expect([...tags].sort()).toEqual([
      'photo-wall-admin:conf-A',
      'photo-wall-device:device-a1',
      'photo-wall-device:device-a2',
      'photo-wall-device:device-a3',
      'photo-wall-device:device-a4',
      'photo-wall-device:device-a6',
      'photo-wall:conf-A',
    ])
  })

  it('a Content Release version of a post is marked and deleted with the post, and its asset goes too', async () => {
    const version = `versions.rSpring.${A('1')}`
    store().put({ ...post('a1', 'conf-A', assetId('s1')), _id: version })
    const report = await run(clock(at(DELETION_DAY)))
    expect(report).toMatchObject({ purged: 1, posts: 7 })
    expect(store().doc(version)).toBeUndefined()
    expect(store().doc(assetId('s1'))).toBeUndefined()
    expect(deletes()).toContainEqual({ id: version, purge: true })
  })

  it('a purged wall is not read again the next day', async () => {
    await run(clock(at(DELETION_DAY)))
    store().reads.length = 0
    await expect(run(clock(at('2026-11-27')))).resolves.toEqual(nothing)
    expect(store().reads.filter((r) => r.query.includes('"wallPost"'))).toEqual(
      [],
    )
  })

  it('holders are checked on the latest documents: a reference the query view still shows for a deleted post does not keep its asset', async () => {
    // The view lags the whole run: it still shows a1 with its photo.
    store().readsLagFor(A('1'), post('a1', 'conf-A', assetId('s1')))
    const report = await run(clock(at(DELETION_DAY)))
    expect(report).toMatchObject({ purged: 1, assets: 5 })
    expect(store().doc(assetId('s1'))).toBeUndefined()
  })

  it(`marks and deletes posts ${POST_DELETE_CHUNK} per chunk, two transactions each`, async () => {
    for (let i = 0; i < POST_DELETE_CHUNK + 5; i += 1) {
      store().put(post(`x${i}`, 'conf-A', null, { status: 'notShown' }))
    }
    const report = await run(clock(at(DELETION_DAY)))
    expect(report).toMatchObject({ purged: 1, posts: POST_DELETE_CHUNK + 11 })
    const kinds = store().commits.map((c) =>
      c.every((m) => 'patch' in m)
        ? `mark ${c.length}`
        : `delete ${c.filter((m) => 'delete' in m && !m.delete.id.startsWith('image-')).length}`,
    )
    expect(kinds.slice(0, 4)).toEqual([
      `mark ${POST_DELETE_CHUNK}`,
      `delete ${POST_DELETE_CHUNK}`,
      'mark 11',
      'delete 11',
    ])
  })
})

describe('an interrupted run repeats the purge: nothing lost, nothing deleted twice (§11.1)', () => {
  beforeEach(closedYesterday)

  it('a crash right after the mark leaves purgedAt unset and the asset ids on the posts; the next run finishes from them', async () => {
    const now = clock(at(DELETION_DAY))
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    const first = await run(now)
    expect(first).toMatchObject({
      purged: 0,
      posts: 0,
      assets: 0,
      unfinished: ['photoWall-conf-A'],
    })
    expect(store().doc('photoWall-conf-A')).not.toHaveProperty('purgedAt')
    expect(store().doc(A('1'))).toMatchObject({
      status: 'deleting',
      deletingAssetId: assetId('s1'),
    })
    expect(store().doc(assetId('s1'))).toBeDefined()

    store().commits.length = 0
    const second = await run(clock(at('2026-11-27')))
    expect(second).toEqual({
      ...nothing,
      due: 1,
      purged: 1,
      posts: 6,
      assets: 5,
      assetsKept: 3,
    })
    expect(new Set(deletedIds()).size).toBe(deletedIds().length)
    expect(store().doc(A('1'))).toBeUndefined()
    expect(store().doc(assetId('s1'))).toBeUndefined()
    expect(store().doc('photoWall-conf-A')).toHaveProperty('purgedAt')
  })

  it('an asset deduplicated from ANOTHER conference’s upload, held only by this wall’s post, is found through the post after a crash and deleted', async () => {
    // Sanity names identical bytes after the first uploader: conf-B's
    // source.id, conf-A's post. A read of conf-A's uploads never finds it.
    store().put(asset('sx', { name: 'photo-wall', id: 'conf-B' }))
    store().put(post('a7', 'conf-A', assetId('sx')))
    const now = clock(at(DELETION_DAY))
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    await run(now)
    expect(store().doc(assetId('sx'))).toBeDefined()
    const second = await run(clock(at('2026-11-27')))
    expect(second).toMatchObject({ purged: 1, posts: 7, assets: 6 })
    expect(store().doc(assetId('sx'))).toBeUndefined()
    expect(store().doc(postId('a7'))).toBeUndefined()
    // …while the one another conference's post also holds survives.
    expect(store().doc(assetId('s2'))).toBeDefined()
    expect(store().doc(postId('b1'))).toMatchObject({
      photo: { asset: ref(assetId('s2')) },
    })
  })

  it('a crash after one chunk’s delete leaves the next chunk’s posts unmarked; the next run deletes only what is left, nothing twice', async () => {
    for (let i = 0; i < POST_DELETE_CHUNK; i += 1) {
      store().put(post(`x${i}`, 'conf-A', assetId(`sx${i}`)))
      store().put(asset(`sx${i}`, { name: 'photo-wall', id: 'conf-B' }))
    }
    const wallPosts = () =>
      store()
        .all()
        .filter(
          (d) =>
            d._type === 'wallPost' &&
            (d.conference as { _ref: string })._ref === 'conf-A',
        )
    expect(wallPosts()).toHaveLength(6 + POST_DELETE_CHUNK)
    const now = clock(at(DELETION_DAY))
    // The second commit is the first chunk's delete: it lands, then the
    // answer is lost.
    store().afterNextCommit(() => {})
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    const first = await run(now)
    expect(first).toMatchObject({
      purged: 0,
      posts: 0,
      unfinished: ['photoWall-conf-A'],
    })
    expect(wallPosts()).toHaveLength(6)
    const firstDeleted = deletedIds()
    expect(firstDeleted.filter((id) => !id.startsWith('image-'))).toHaveLength(
      POST_DELETE_CHUNK,
    )

    store().commits.length = 0
    const second = await run(clock(at('2026-11-27')))
    expect(second).toMatchObject({ purged: 1, posts: 6 })
    expect(deletedIds().filter((id) => firstDeleted.includes(id))).toEqual([])
    expect(wallPosts()).toEqual([])
    expect(
      store()
        .all()
        .filter((d) => d._id.startsWith('image-sx')),
    ).toEqual([])
  })

  it('a refused delete transaction leaves purgedAt unset and the posts marked; the next run finishes', async () => {
    let refuse = true
    onMutate(async (mutations, options, real) => {
      if (refuse && mutations.some((m) => m.delete?.id === assetId('s5'))) {
        throw Object.assign(new Error('409: contention'), {
          statusCode: 409,
        })
      }
      return real(mutations, options)
    })
    const first = await run(clock(at(DELETION_DAY)))
    expect(first).toMatchObject({
      purged: 0,
      posts: 0,
      assets: 0,
      unfinished: ['photoWall-conf-A'],
    })
    expect(store().doc(assetId('s5'))).toBeDefined()
    expect(store().doc(A('5'))).toMatchObject({
      status: 'deleting',
      deletingAssetId: assetId('s5'),
    })
    expect(store().doc('photoWall-conf-A')).not.toHaveProperty('purgedAt')
    refuse = false

    store().commits.length = 0
    const second = await run(clock(at('2026-11-27')))
    expect(second).toMatchObject({ purged: 1, posts: 6, assets: 5 })
    expect(store().doc(assetId('s5'))).toBeUndefined()
  })

  it("when 'held' can't be told, nothing is deleted and purgedAt stays unset", async () => {
    store().failReadsThat((read) => read.query.includes('references('))
    const report = await run(clock(at(DELETION_DAY)))
    expect(report).toMatchObject({
      purged: 0,
      posts: 0,
      assets: 0,
      assetsKept: 0,
      unfinished: ['photoWall-conf-A'],
    })
    expect(deletedIds()).toEqual([])
    expect(store().doc('photoWall-conf-A')).not.toHaveProperty('purgedAt')
  })

  it("when only the LAST asset's holder check can't be told, the chunk still deletes nothing", async () => {
    // Every other check has answered by then: only this one is unknown.
    store().failReadsThat(
      (read) =>
        read.query.includes('references(') &&
        read.params.assetId === assetId('s6'),
    )
    const report = await run(clock(at(DELETION_DAY)))
    expect(report).toMatchObject({
      purged: 0,
      posts: 0,
      unfinished: ['photoWall-conf-A'],
    })
    expect(deletedIds()).toEqual([])
    expect(store().doc(`drafts.${A('6')}`)).toMatchObject({
      status: 'deleting',
      deletingAssetId: assetId('s6'),
    })
  })

  it('a failed purge of one wall does not stop the next wall', async () => {
    // Both due on 31 December; conf-A's post delete is refused.
    store().put(wall('conf-B', { closedAt: '2026-12-30T03:10:00Z' }))
    onMutate(async (mutations, options, real) => {
      if (mutations.some((m) => m.delete?.id === A('1'))) {
        throw new Error('503')
      }
      return real(mutations, options)
    })
    const report = await run(clock(at('2026-12-31')))
    expect(report).toMatchObject({
      due: 2,
      purged: 1,
      unfinished: ['photoWall-conf-A'],
    })
    expect(store().doc('photoWall-conf-B')).toHaveProperty('purgedAt')
    expect(store().doc(postId('b1'))).toBeUndefined()
    expect(store().doc(A('1'))).toBeDefined()
  })
})

describe('the deadline', () => {
  beforeEach(closedYesterday)

  it('a wall not reached before the deadline is counted, and nothing of it is written', async () => {
    const now = clock(at(DELETION_DAY))
    const report = await run(now, now)
    expect(report).toEqual({ ...nothing, due: 1, notReached: 1 })
    expect(store().commits).toEqual([])
  })

  it('past the deadline after a chunk, the conference’s loose uploads are not touched and purgedAt stays unset', async () => {
    const now = clock(at(DELETION_DAY))
    const deadline = new Date(now.getTime() + 60_000)
    store().afterNextCommit(() => {})
    store().afterNextCommit(() => {
      vi.setSystemTime(new Date(deadline.getTime() + 1))
    })
    const report = await run(now, deadline)
    expect(report).toMatchObject({
      posts: 6,
      assets: 4,
      purged: 0,
      unfinished: ['photoWall-conf-A'],
    })
    expect(store().doc(assetId('s7'))).toBeDefined()
    expect(store().doc('photoWall-conf-A')).not.toHaveProperty('purgedAt')
  })
  it('past the deadline between holder checks, the chunk stops: no delete sent, the posts stay marked, purgedAt unset', async () => {
    const now = clock(at(DELETION_DAY))
    const deadline = new Date(now.getTime() + 60_000)
    let holderReads = 0
    store().beforeEachRead((read) => {
      if (read.query.includes('references($assetId)')) {
        holderReads += 1
        vi.setSystemTime(new Date(deadline.getTime() + 1))
      }
    })
    const report = await run(now, deadline)
    // The first check passed the deadline; of the chunk's six assets, no
    // other check started after it.
    expect(holderReads).toBe(1)
    expect(report).toMatchObject({
      posts: 0,
      assets: 0,
      purged: 0,
      unfinished: ['photoWall-conf-A'],
    })
    expect(deletedIds()).toEqual([])
    expect(store().doc(A('1'))).toMatchObject({
      status: 'deleting',
      deletingAssetId: assetId('s1'),
    })
  })

  /** A read or a commit that never answers until its signal aborts it. */
  const hangUntilAborted = (signal: AbortSignal | undefined) =>
    new Promise<never>((_, reject) => {
      if (!signal) return
      signal.addEventListener('abort', () => reject(signal.reason))
    })

  it('a holder check that hangs is cut off at the deadline: the run ends, nothing deleted, purgedAt unset', async () => {
    const now = clock(at(DELETION_DAY))
    store().beforeEachRead((read) =>
      read.query.includes('references($assetId)')
        ? hangUntilAborted(read.signal)
        : undefined,
    )
    // A real 50 ms budget: the clock the run reads is frozen.
    const report = await run(now, new Date(now.getTime() + 50))
    expect(report).toMatchObject({
      posts: 0,
      assets: 0,
      purged: 0,
      unfinished: ['photoWall-conf-A'],
    })
    expect(deletedIds()).toEqual([])
  })

  it('a delete transaction that hangs is cut off at the deadline: the run ends with the wall unpurged', async () => {
    const now = clock(at(DELETION_DAY))
    const sent = onMutate((_m, options) => hangUntilAborted(options?.signal))
    const report = await run(now, new Date(now.getTime() + 50))
    expect(report).toMatchObject({
      posts: 0,
      purged: 0,
      unfinished: ['photoWall-conf-A'],
    })
    // The delete was sent, and hung: it is what the deadline cut off.
    expect(sent).toHaveLength(1)
    expect(store().doc(A('1'))).toMatchObject({ status: 'deleting' })
    expect(store().doc('photoWall-conf-A')).not.toHaveProperty('purgedAt')
  })
})

describe('the deduplicated asset is already gone after a crash past the chunk’s delete (§11.1)', () => {
  beforeEach(closedYesterday)

  it('a crash right after the chunk’s delete: the asset and the posts went together, the next run has nothing of them left to find', async () => {
    store().put(asset('sx', { name: 'photo-wall', id: 'conf-B' }))
    store().put(post('a7', 'conf-A', assetId('sx')))
    const now = clock(at(DELETION_DAY))
    store().afterNextCommit(() => {})
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    await run(now)
    expect(store().doc(assetId('sx'))).toBeUndefined()
    expect(store().doc(postId('a7'))).toBeUndefined()
    const second = await run(clock(at('2026-11-27')))
    expect(second).toMatchObject({ purged: 1, posts: 0 })
    expect(store().doc(assetId('sx'))).toBeUndefined()
  })
})
