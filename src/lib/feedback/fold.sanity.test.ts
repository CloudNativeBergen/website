/**
 * @vitest-environment node
 *
 * THE 24-MONTH FOLD (speaker feedback spec §12.2, #1438), against
 * `versionedSanityStore`: the reads run through groq-js, each chunk is built
 * by the real `@sanity/client` transaction and applied with `@sanity/mutator`,
 * with revision guards, the 404 of a patch on a missing document and the
 * API-version rule for `versions.**`. `releases::all()` is answered here, as
 * production answers it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

type Doc = Record<string, unknown> & { _id: string }
type Fetch = (
  query: string,
  params?: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<unknown>
interface Writer {
  fetch: Fetch
  [key: string]: unknown
}

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  releases: [] as { name: string; state: string }[],
  releasesFail: false,
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => h.revalidateTag(...args),
  updateTag: () => {},
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  const clients = h.store.clients as {
    clientWrite: Writer & { withConfig: (c: { apiVersion: string }) => Writer }
  }
  // groq-js has no `releases::all()`: answered as production does.
  const withReleases = (w: Writer): Writer => ({
    ...w,
    fetch: async (query, params, options) => {
      if (!query.includes('releases::all()')) {
        return w.fetch(query, params, options)
      }
      if (h.releasesFail) throw new Error('503 releases unavailable')
      return h.releases.map((r) => ({
        _id: `_.releases.${r.name}`,
        state: r.state,
      }))
    },
  })
  return {
    ...h.store.clients,
    clientWrite: {
      ...clients.clientWrite,
      withConfig: (c: { apiVersion: string }) =>
        withReleases(clients.clientWrite.withConfig(c)),
    },
  }
})

import { runGroq } from '../../../__tests__/helpers/sanityStore'
import {
  CHUNK_BUDGET_MS,
  FOLD_CANDIDATES,
  FOLD_CHUNK_SIZE,
  foldCutoff,
  foldExpiredFeedback,
  foldTalkFeedback,
} from './fold'
import { talkTotals, type TalkCounts } from './totals'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** 2026-10-21: 24 months back is 2024-10-21. */
const NOW = new Date('2026-10-21T04:40:00.000Z')

const conference = (id: string, endDate: string) => ({
  _id: id,
  _type: 'conference',
  _rev: `rev-${id}`,
  title: id,
  startDate: endDate,
  endDate,
})

const talk = (id: string, conferenceId = 'conf-old', extra: object = {}) => ({
  _id: id,
  _type: 'talk',
  _rev: `rev-${id}`,
  conference: ref(conferenceId),
  status: 'confirmed',
  title: `Title of ${id}`,
  speakers: [{ ...ref('sp-1'), _key: 'k1' }],
  feedbackCode: 'ABC234',
  audienceFeedback: { greenCount: 4, yellowCount: 1, redCount: 0 },
  ...extra,
})

const response = (
  id: string,
  colour: string,
  talkId = 'talk-1',
  conferenceId = 'conf-old',
  extra: object = {},
) => ({
  _id: id,
  _type: 'feedbackResponse',
  _rev: `rev-${id}`,
  talk: ref(talkId),
  conference: ref(conferenceId),
  colour,
  submittedAt: '2024-06-10T08:00:00.000Z',
  ...extra,
})

const COLOURS = ['green', 'yellow', 'red'] as const
/** `n` responses to `talkId`, colours in turn: green, yellow, red, green… */
const responses = (n: number, talkId = 'talk-1', prefix = 'r') =>
  Array.from({ length: n }, (_, i) =>
    response(`${prefix}-${String(i).padStart(4, '0')}`, COLOURS[i % 3], talkId),
  )

const liveResponses = (talkId = 'talk-1') =>
  store()
    .all()
    .filter(
      (d) => d._type === 'feedbackResponse' && (d.talk as Doc)?._ref === talkId,
    )

/** The combined totals every surface shows (§4.3), as stored now. */
const totalsNow = (talkId = 'talk-1') =>
  talkTotals(
    store().doc(talkId) as TalkCounts,
    liveResponses(talkId) as { colour?: unknown }[],
  ).combined

const folded = (id: string) =>
  store().doc(id)?.feedbackFolded as Record<string, unknown> | undefined

const counts = (id: string) => {
  const f = folded(id)
  return (
    f && {
      green: f.greenCount,
      yellow: f.yellowCount,
      red: f.redCount,
    }
  )
}

/** Response deletes per committed transaction. */
const deletesPerCommit = () =>
  store().commits.map((c) => c.filter((m) => 'delete' in m).length)

beforeEach(() => {
  h.releases = []
  h.releasesFail = false
  h.revalidateTag.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('foldTalkFeedback', () => {
  it('a first fold of a talk with no feedbackFolded counts every response, on the talk and every version, and leaves the totals unchanged', async () => {
    h.releases = [{ name: 'rel-a', state: 'active' }]
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      { ...talk('drafts.talk-1'), _rev: 'rev-draft' },
      { ...talk('versions.rel-a.talk-1'), _rev: 'rev-rel' },
      response('r-1', 'green'),
      response('r-2', 'green'),
      response('r-3', 'green'),
      response('r-4', 'yellow'),
      response('r-5', 'yellow'),
      response('r-6', 'red', 'talk-1', 'conf-old', {
        hiddenAt: NOW.toISOString(),
        comment: 'meh',
      }),
      // Another talk's response is not this talk's.
      response('r-other', 'red', 'talk-2'),
    ])
    const before = totalsNow()
    expect(before).toEqual({ green: 7, yellow: 3, red: 1 })

    const outcome = await foldTalkFeedback('talk-1', { now: NOW })

    expect(outcome).toMatchObject({ status: 'folded', responses: 6 })
    for (const id of ['talk-1', 'drafts.talk-1', 'versions.rel-a.talk-1']) {
      expect(counts(id)).toEqual({ green: 3, yellow: 2, red: 1 })
      expect(folded(id)?.foldedAt).toBe(NOW.toISOString())
      expect(store().doc(id)?.feedbackCode).toBeUndefined()
    }
    expect(liveResponses()).toEqual([])
    expect(store().doc('r-other')).toBeDefined()
    // §4.3: the fold changes where the counts live, not what they are.
    expect(totalsNow()).toEqual(before)
    // One transaction, each talk patch guarded by its own revision.
    expect(store().commits).toHaveLength(1)
    const guards = Object.fromEntries(
      store().commits[0].flatMap((m) =>
        'patch' in m ? [[m.patch.id, m.patch.ifRevisionID]] : [],
      ),
    )
    expect(guards).toMatchObject({
      'talk-1': 'rev-talk-1',
      'drafts.talk-1': 'rev-draft',
      'versions.rel-a.talk-1': 'rev-rel',
      'r-1': 'rev-r-1',
      'r-6': 'rev-r-6',
    })
  })
})

describe('foldTalkFeedback: chunks and guards', () => {
  it('each response is guarded by a patch that unsets only the revision-lock pseudo-field, as Studio’s publish does', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
    ])
    await foldTalkFeedback('talk-1', { now: NOW })
    const [tx] = store().commits
    expect(tx).toContainEqual({
      patch: {
        id: 'r-1',
        ifRevisionID: 'rev-r-1',
        unset: ['_revision_lock_pseudo_field_'],
      },
    })
    expect(tx).toContainEqual({ delete: { id: 'r-1' } })
  })

  it('a later chunk adds to the PUBLISHED totals, not to a draft made before the first chunk landed', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      ...responses(150),
    ])
    const before = totalsNow()
    // A draft made from the talk as it was before chunk 1 landed: no totals.
    store().afterNextCommit(() =>
      store().put({ ...talk('drafts.talk-1'), _rev: 'rev-late-draft' }),
    )
    const outcome = await foldTalkFeedback('talk-1', { now: NOW })
    expect(outcome).toEqual({ status: 'folded', responses: 150 })
    expect(counts('talk-1')).toEqual({ green: 50, yellow: 50, red: 50 })
    expect(counts('drafts.talk-1')).toEqual({ green: 50, yellow: 50, red: 50 })
    expect(totalsNow()).toEqual(before)
  })

  it('folds in chunks of at most 100, adding to the totals a talk already has', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1', 'conf-old', {
        feedbackFolded: { greenCount: 5, yellowCount: 0, redCount: 2 },
      }),
      ...responses(250),
    ])
    const before = totalsNow()

    const outcome = await foldTalkFeedback('talk-1', { now: NOW })

    expect(FOLD_CHUNK_SIZE).toBe(100)
    expect(outcome).toEqual({ status: 'folded', responses: 250 })
    expect(deletesPerCommit()).toEqual([100, 100, 50])
    // 250 in turn: 84 green, 83 yellow, 83 red.
    expect(counts('talk-1')).toEqual({ green: 89, yellow: 83, red: 85 })
    expect(totalsNow()).toEqual(before)
  })

  it('finishes when GROQ still lists the responses a chunk just deleted', async () => {
    const all = responses(150)
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      ...all,
    ])
    // The search store lags the delete by about a second (Sanity documents
    // it): the first chunk's responses stay listed after their commit.
    for (const r of all.slice(0, 100)) store().readsLagFor(r._id, r)

    const outcome = await foldTalkFeedback('talk-1', { now: NOW })

    expect(outcome).toEqual({ status: 'folded', responses: 150 })
    expect(deletesPerCommit()).toEqual([100, 50])
    expect(counts('talk-1')).toEqual({ green: 50, yellow: 50, red: 50 })
  }, 10_000)

  it('a response removed between plan and commit aborts the chunk, and the re-plan does not count it', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
      response('r-2', 'red'),
      response('r-3', 'yellow'),
    ])
    // An organizer's Remove lands after the read, before the commit.
    store().beforeNextCommit(() => store().remove('r-2'))

    const outcome = await foldTalkFeedback('talk-1', { now: NOW })

    expect(outcome).toEqual({ status: 'folded', responses: 2 })
    expect(counts('talk-1')).toEqual({ green: 1, yellow: 1, red: 0 })
    // The first commit was refused whole: one commit, not two.
    expect(store().commits).toHaveLength(1)
  })

  it('a response re-coloured between plan and commit is counted with its new colour', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
      response('r-2', 'green'),
    ])
    // The same device changed its answer after the read.
    store().beforeNextCommit(() =>
      store().put({ ...response('r-2', 'red'), _rev: 'rev-r-2-changed' }),
    )

    await foldTalkFeedback('talk-1', { now: NOW })

    expect(counts('talk-1')).toEqual({ green: 1, yellow: 0, red: 1 })
    expect(liveResponses()).toEqual([])
  })

  it('a talk whose totals changed between plan and commit is re-planned from its new totals', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
      response('r-2', 'yellow'),
    ])
    // Another run's chunk committed meanwhile: 10 more greens folded.
    store().beforeNextCommit(() =>
      store().put({
        ...talk('talk-1'),
        _rev: 'rev-other-run',
        feedbackFolded: { greenCount: 10, yellowCount: 0, redCount: 0 },
      }),
    )

    await foldTalkFeedback('talk-1', { now: NOW })

    expect(counts('talk-1')).toEqual({ green: 11, yellow: 1, red: 0 })
  })

  it('a draft edited between plan and commit aborts the chunk; the re-plan folds it too', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      { ...talk('drafts.talk-1'), _rev: 'rev-draft' },
      response('r-1', 'green'),
    ])
    store().beforeNextCommit(() =>
      store().put({
        ...talk('drafts.talk-1'),
        title: 'Edited in Studio',
        _rev: 'rev-draft-2',
      }),
    )
    const attempts: string[] = []
    store().beforeNextCommit(() => void attempts.push('second'))

    await foldTalkFeedback('talk-1', { now: NOW })

    // Refused once, then committed on the re-plan.
    expect(attempts).toEqual(['second'])
    expect(store().commits).toHaveLength(1)
    expect(store().doc('drafts.talk-1')).toMatchObject({
      title: 'Edited in Studio',
      feedbackFolded: { greenCount: 1, yellowCount: 0, redCount: 0 },
    })
    expect(store().doc('drafts.talk-1')?.feedbackCode).toBeUndefined()
  })

  it('a chunk that keeps losing its guards is given up after the retries, committing nothing', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
    ])
    let edits = 0
    for (let i = 0; i < 10; i++) {
      store().beforeNextCommit(() =>
        store().put({ ...response('r-1', 'green'), _rev: `edit-${++edits}` }),
      )
    }

    await expect(foldTalkFeedback('talk-1', { now: NOW })).rejects.toThrow(
      /revision/,
    )
    expect(edits).toBe(4)
    expect(store().commits).toEqual([])
    expect(folded('talk-1')).toBeUndefined()
  })

  it('a crash between chunks neither double-counts nor loses a response', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      ...responses(150),
    ])
    const before = totalsNow()
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {
      throw new Error('socket hang up')
    })

    await expect(foldTalkFeedback('talk-1', { now: NOW })).rejects.toThrow(
      'socket hang up',
    )
    expect(deletesPerCommit()).toEqual([100])
    expect(liveResponses()).toHaveLength(50)
    expect(totalsNow()).toEqual(before)

    const next = await foldTalkFeedback('talk-1', { now: NOW })

    expect(next).toEqual({ status: 'folded', responses: 50 })
    expect(counts('talk-1')).toEqual({ green: 50, yellow: 50, red: 50 })
    expect(totalsNow()).toEqual(before)
  })

  it('a deadline between chunks stops the fold, keeps what it folded, and still sweeps', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      ...responses(150),
    ])
    const start = Date.now()
    let clock = start
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    // Room for one chunk; then, while it commits, a draft is made from the
    // talk as it was and the run's time is up.
    store().afterNextCommit(() => {
      store().put({ ...talk('drafts.talk-1'), _rev: 'rev-late-draft' })
      clock = start + CHUNK_BUDGET_MS
    })

    const outcome = await foldTalkFeedback('talk-1', {
      now: NOW,
      deadline: new Date(start + CHUNK_BUDGET_MS + 1),
    })

    expect(outcome).toEqual({ status: 'late', responses: 100 })
    expect(deletesPerCommit()[0]).toBe(100)
    expect(liveResponses()).toHaveLength(50)
    // The sweep ran although the fold stopped early.
    expect(store().doc('drafts.talk-1')?.feedbackCode).toBeUndefined()
    expect(counts('drafts.talk-1')).toEqual(counts('talk-1'))
  })

  it('a retry after a lost guard starts only with a whole chunk budget left: late, nothing deleted', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      ...responses(3),
    ])
    const start = Date.now()
    let clock = start
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    // Admitted with exactly the budget left; while it commits, a response
    // is edited (the guard fails) and the clock moves on.
    store().beforeNextCommit(() => {
      store().put({ ...response('r-0000', 'green'), _rev: 'rev-edited' })
      clock = start + 1
    })

    const outcome = await foldTalkFeedback('talk-1', {
      now: NOW,
      deadline: new Date(start + CHUNK_BUDGET_MS),
    })

    expect(outcome).toEqual({ status: 'late', responses: 0 })
    expect(store().commits).toEqual([])
    expect(liveResponses()).toHaveLength(3)
  })

  it('a fold that throws after a committed chunk still sweeps', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      ...responses(150),
    ])
    store().afterNextCommit(() =>
      store().put({ ...talk('drafts.talk-1'), _rev: 'rev-late-draft' }),
    )
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {
      throw new Error('socket hang up')
    })

    await expect(foldTalkFeedback('talk-1', { now: NOW })).rejects.toThrow(
      'socket hang up',
    )
    expect(store().doc('drafts.talk-1')?.feedbackCode).toBeUndefined()
    expect(counts('drafts.talk-1')).toEqual({ green: 34, yellow: 33, red: 33 })
  })

  it('a commit that lands although the client gave up still sweeps', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      ...responses(3),
    ])
    // Applied at Sanity, but the reply is lost (the request's abort signal
    // fired): the run reports a failure with nothing counted as folded.
    store().afterNextCommit(() => {
      store().put({ ...talk('drafts.talk-1'), _rev: 'rev-late-draft' })
      throw new Error('This operation was aborted')
    })

    await expect(foldTalkFeedback('talk-1', { now: NOW })).rejects.toThrow(
      'aborted',
    )
    expect(liveResponses()).toEqual([])
    expect(store().doc('drafts.talk-1')?.feedbackCode).toBeUndefined()
    expect(counts('drafts.talk-1')).toEqual({ green: 1, yellow: 1, red: 1 })
  })

  it('stops, as late, when GROQ keeps listing responses that are gone', async () => {
    const ghosts = responses(350, 'talk-1', 'gone')
    store().reset([conference('conf-old', '2024-09-01'), talk('talk-1')])
    // Removed by another writer a moment ago; the search store still lists them.
    for (const r of ghosts) store().readsLagFor(r._id, r)

    const outcome = await foldTalkFeedback('talk-1', { now: NOW })

    expect(outcome).toEqual({ status: 'late', responses: 0 })
    expect(store().commits).toEqual([])
  })

  it('a second run commits nothing', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      { ...talk('drafts.talk-1'), _rev: 'rev-draft' },
      ...responses(5),
    ])
    await foldTalkFeedback('talk-1', { now: NOW })
    const after = structuredClone(store().all())
    const commits = store().commits.length

    const again = await foldTalkFeedback('talk-1', {
      now: new Date('2026-10-22T04:40:00.000Z'),
    })

    expect(again).toEqual({ status: 'nothing', responses: 0 })
    expect(store().commits).toHaveLength(commits)
    expect(store().all()).toEqual(after)
  })

  it('a talk with no responses plans nothing, and keeps its code', async () => {
    store().reset([conference('conf-old', '2024-09-01'), talk('talk-1')])
    const outcome = await foldTalkFeedback('talk-1', { now: NOW })
    expect(outcome).toEqual({ status: 'nothing', responses: 0 })
    expect(store().commits).toEqual([])
    expect(store().doc('talk-1')?.feedbackCode).toBe('ABC234')
  })

  it('only folds the responses the totals count: the talk’s own conference, published', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
      response('drafts.r-2', 'green'),
      response('r-3', 'red', 'talk-1', 'conf-other'),
    ])
    const before = totalsNow()
    await foldTalkFeedback('talk-1', { now: NOW })
    expect(counts('talk-1')).toEqual({ green: 1, yellow: 0, red: 0 })
    expect(store().doc('drafts.r-2')).toBeDefined()
    expect(store().doc('r-3')).toBeDefined()
    expect(totalsNow()).toEqual(before)
  })

  it.each([
    ['a version waits in a scheduled release', false],
    ['the releases cannot be listed', true],
  ])('holds the talk when %s, writing nothing', async (_, releasesFail) => {
    h.releases = [{ name: 'rel-s', state: 'scheduled' }]
    h.releasesFail = releasesFail
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      { ...talk('versions.rel-s.talk-1'), _rev: 'rev-rel' },
      response('r-1', 'green'),
    ])
    const outcome = await foldTalkFeedback('talk-1', { now: NOW })
    expect(outcome).toEqual({ status: 'held', responses: 0 })
    expect(store().commits).toEqual([])
    expect(store().doc('r-1')).toBeDefined()
  })

  it('the sweep re-patches a draft created between the read and the commit, which still holds the code', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
      response('r-2', 'yellow'),
    ])
    // A draft made from the talk as it was, landing during the commit: no
    // guard can catch it, since it was not in the transaction.
    store().afterNextCommit(() =>
      store().put({
        ...talk('drafts.talk-1'),
        _rev: 'rev-late-draft',
        title: 'Late draft',
      }),
    )

    await foldTalkFeedback('talk-1', { now: NOW })

    expect(store().doc('drafts.talk-1')).toMatchObject({
      title: 'Late draft',
      feedbackFolded: store().doc('talk-1')?.feedbackFolded,
    })
    expect(store().doc('drafts.talk-1')?.feedbackCode).toBeUndefined()
  })

  it('the sweep re-patches a version with the right totals that still holds the code', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
    ])
    // A copy taken after the totals landed, from a version that kept the code.
    store().afterNextCommit(() =>
      store().put({
        ...talk('drafts.talk-1'),
        _rev: 'rev-late-draft',
        feedbackFolded: store().doc('talk-1')?.feedbackFolded,
      }),
    )
    await foldTalkFeedback('talk-1', { now: NOW })
    expect(store().doc('drafts.talk-1')?.feedbackCode).toBeUndefined()
    expect(counts('drafts.talk-1')).toEqual({ green: 1, yellow: 0, red: 0 })
  })

  it('the sweep re-patches a version whose counts match but whose foldedAt is stale', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
    ])
    // The same counts, from an earlier fold's timestamp.
    store().afterNextCommit(() =>
      store().put({
        ...talk('drafts.talk-1'),
        feedbackCode: undefined,
        _rev: 'rev-late-draft',
        feedbackFolded: {
          greenCount: 1,
          yellowCount: 0,
          redCount: 0,
          foldedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    )
    await foldTalkFeedback('talk-1', { now: NOW })
    expect(folded('drafts.talk-1')?.foldedAt).toBe(NOW.toISOString())
  })

  it('the sweep re-patches a version holding stale folded totals', async () => {
    store().reset([
      conference('conf-old', '2024-09-01'),
      talk('talk-1'),
      response('r-1', 'green'),
    ])
    store().afterNextCommit(() =>
      store().put({
        ...talk('drafts.talk-1'),
        feedbackCode: undefined,
        _rev: 'rev-late-draft',
        feedbackFolded: { greenCount: 0, yellowCount: 0, redCount: 0 },
      }),
    )
    await foldTalkFeedback('talk-1', { now: NOW })
    expect(counts('drafts.talk-1')).toEqual({ green: 1, yellow: 0, red: 0 })
  })
})

describe('foldExpiredFeedback (the daily cron)', () => {
  it('folds every talk past the retention, expires its conference’s code index at once, and reports', async () => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      conference('conf-recent', '2024-11-21'),
      talk('talk-1', 'conf-old'),
      talk('talk-2', 'conf-old'),
      talk('talk-recent', 'conf-recent'),
      ...responses(3, 'talk-1', 'a'),
      ...responses(2, 'talk-2', 'b').map((r) => r),
      response('c-1', 'green', 'talk-recent', 'conf-recent'),
    ])

    const report = await foldExpiredFeedback({ now: NOW })

    expect(report).toEqual({
      candidates: 2,
      folded: 2,
      responses: 5,
      held: 0,
      failed: 0,
      ineligible: 0,
      notReached: 0,
    })
    expect(h.revalidateTag).toHaveBeenCalledWith(
      'sanity:feedback-code-index-conf-old',
      { expire: 0 },
    )
    expect(h.revalidateTag).not.toHaveBeenCalledWith(
      'sanity:feedback-code-index-conf-recent',
      expect.anything(),
    )
    expect(store().doc('c-1')).toBeDefined()
    expect(store().doc('talk-recent')?.feedbackCode).toBe('ABC234')
  })

  it('logs a held talk as overdue every run it holds', async () => {
    h.releases = [{ name: 'rel-s', state: 'scheduled' }]
    store().reset([
      conference('conf-old', '2024-09-21'),
      talk('talk-1', 'conf-old'),
      { ...talk('versions.rel-s.talk-1', 'conf-old'), _rev: 'rev-rel' },
      response('r-1', 'green'),
    ])
    const errors = vi.mocked(console.error)

    const report = await foldExpiredFeedback({ now: NOW })

    expect(report).toMatchObject({ candidates: 1, held: 1, folded: 0 })
    expect(
      errors.mock.calls.some(
        ([line]) =>
          typeof line === 'string' &&
          line.includes('RETENTION OVERDUE') &&
          line.includes('talk-1'),
      ),
    ).toBe(true)
  })

  it.each([
    [
      'the talk was moved to a recent conference',
      () =>
        store().put({ ...talk('talk-1', 'conf-recent'), _rev: 'rev-moved' }),
    ],
    [
      'its conference’s end date was corrected to a recent one',
      () =>
        store().put({
          ...conference('conf-old', '2025-06-01'),
          _rev: 'rev-corrected',
        }),
    ],
  ])('deletes nothing when, after the selection, %s', async (_, change) => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      conference('conf-recent', '2025-06-01'),
      talk('talk-1', 'conf-old'),
      response('r-1', 'green'),
    ])
    // The selection reads GROQ as it was; the fold reads the documents now.
    const asSelected = structuredClone(store().all())
    change()
    for (const d of asSelected) store().readsLagFor(d._id, d)

    const report = await foldExpiredFeedback({ now: NOW })

    expect(report).toMatchObject({ candidates: 1, folded: 0, responses: 0 })
    expect(store().commits).toEqual([])
    expect(store().doc('r-1')).toBeDefined()
  })

  it('deletes nothing when the end date is corrected between the eligibility read and the commit', async () => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      talk('talk-1', 'conf-old'),
      response('r-1', 'green'),
    ])
    // Lands after the fold read the conference, before its chunk commits.
    store().beforeNextCommit(() =>
      store().put({
        ...conference('conf-old', '2025-06-01'),
        _rev: 'rev-corrected',
      }),
    )

    const report = await foldExpiredFeedback({ now: NOW })

    expect(report).toMatchObject({ ineligible: 1, responses: 0 })
    expect(store().doc('r-1')).toBeDefined()
    expect(store().commits).toEqual([])
  })

  it('a chunk carries the conference’s revision as a guard, changing no conference field', async () => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      talk('talk-1', 'conf-old'),
      response('r-1', 'green'),
    ])
    const before = structuredClone(store().doc('conf-old'))
    await foldExpiredFeedback({ now: NOW })
    expect(store().commits[0]).toContainEqual({
      patch: {
        id: 'conf-old',
        ifRevisionID: 'rev-conf-old',
        unset: ['_revision_lock_pseudo_field_'],
      },
    })
    // Every field but the revision is as it was.
    expect({ ...store().doc('conf-old'), _rev: null }).toEqual({
      ...before,
      _rev: null,
    })
  })

  it('expires the code index of a talk whose fold failed after a committed chunk', async () => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      talk('talk-1', 'conf-old'),
      ...responses(150),
    ])
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {
      throw new Error('socket hang up')
    })
    await foldExpiredFeedback({ now: NOW })
    expect(h.revalidateTag).toHaveBeenCalledWith(
      'sanity:feedback-code-index-conf-old',
      { expire: 0 },
    )
  })

  it('does not fold a talk whose conference reads without a revision (no guard possible)', async () => {
    const { _rev: _unused, ...noRev } = conference('conf-old', '2024-09-21')
    void _unused
    store().reset([noRev, talk('talk-1', 'conf-old'), response('r-1', 'green')])
    const report = await foldExpiredFeedback({ now: NOW })
    expect(report).toMatchObject({ ineligible: 1, responses: 0 })
    expect(store().doc('r-1')).toBeDefined()
  })

  it('expires the code index of the conference the talk is folded under, when it moved to another past one', async () => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      conference('conf-older', '2024-03-01'),
      talk('talk-1', 'conf-old'),
      response('r-1', 'green', 'talk-1', 'conf-old'),
    ])
    // Selected under conf-old; right after the selection the talk (and its
    // response) move to conf-older, also past the retention.
    let reads = 0
    store().beforeEachRead(() => {
      if (++reads !== 2) return
      store().put({ ...talk('talk-1', 'conf-older'), _rev: 'rev-moved' })
      store().put(response('r-1', 'green', 'talk-1', 'conf-older'))
    })

    const report = await foldExpiredFeedback({ now: NOW })

    expect(report).toMatchObject({ folded: 1, responses: 1 })
    expect(h.revalidateTag).toHaveBeenCalledWith(
      'sanity:feedback-code-index-conf-older',
      { expire: 0 },
    )
  })

  it('counts the responses a failed talk folded before it failed', async () => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      talk('talk-1', 'conf-old'),
      ...responses(150),
    ])
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {
      throw new Error('socket hang up')
    })
    const report = await foldExpiredFeedback({ now: NOW })
    expect(report).toMatchObject({ failed: 1, responses: 100 })
  })

  it('leaves the talks for the next run once the deadline has passed', async () => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      talk('talk-1', 'conf-old'),
      response('r-1', 'green'),
    ])
    const report = await foldExpiredFeedback({
      now: NOW,
      deadline: new Date(Date.now() - 1),
    })
    expect(report).toMatchObject({ candidates: 1, notReached: 1, folded: 0 })
    expect(store().commits).toEqual([])
  })

  it('a talk whose fold fails does not stop the others', async () => {
    store().reset([
      conference('conf-old', '2024-09-21'),
      talk('talk-1', 'conf-old'),
      talk('talk-2', 'conf-old'),
      response('a-1', 'green', 'talk-1'),
      response('b-1', 'green', 'talk-2'),
    ])
    store().failPatchesOf('talk-1')
    const report = await foldExpiredFeedback({ now: NOW })
    expect(report).toMatchObject({ candidates: 2, folded: 1, failed: 1 })
    expect(store().doc('a-1')).toBeDefined()
    expect(store().doc('b-1')).toBeUndefined()
  })
})

describe('the fold candidates (executed GROQ)', () => {
  it('finds a talk of a conference that ended 25 months ago with responses, and nothing else', async () => {
    const dataset = [
      conference('conf-old', '2024-09-21'), // 25 months before NOW
      conference('conf-recent', '2024-11-21'), // 23 months
      talk('talk-1', 'conf-old'),
      talk('talk-recent', 'conf-recent'),
      talk('talk-silent', 'conf-old'),
      // Only a draft and a release version have responses: not a talk.
      talk('drafts.talk-draft', 'conf-old'),
      talk('versions.rel-a.talk-version', 'conf-old'),
      // Its only response is a draft copy.
      talk('talk-draft-response', 'conf-old'),
      response('r-1', 'green', 'talk-1', 'conf-old'),
      response('r-2', 'green', 'talk-recent', 'conf-recent'),
      response('r-3', 'green', 'drafts.talk-draft', 'conf-old'),
      response('r-4', 'green', 'versions.rel-a.talk-version', 'conf-old'),
      response('drafts.r-5', 'green', 'talk-draft-response', 'conf-old'),
    ]
    const found = await runGroq(dataset, FOLD_CANDIDATES, {
      cutoff: foldCutoff(NOW),
    })
    expect(found).toEqual([{ _id: 'talk-1', conferenceId: 'conf-old' }])
  })

  it('the 24-month boundary, to the day: ended the day before the cutoff is folded; on it or after, not', async () => {
    // NOW is 2026-10-21, so the cutoff is 2024-10-21 (worked by hand).
    const dataset = [
      conference('conf-before', '2024-10-20'),
      conference('conf-on', '2024-10-21'),
      conference('conf-after', '2024-10-22'),
      talk('talk-before', 'conf-before'),
      talk('talk-on', 'conf-on'),
      talk('talk-after', 'conf-after'),
      response('r-before', 'green', 'talk-before', 'conf-before'),
      response('r-on', 'green', 'talk-on', 'conf-on'),
      response('r-after', 'green', 'talk-after', 'conf-after'),
    ]
    const found = await runGroq(dataset, FOLD_CANDIDATES, {
      cutoff: foldCutoff(NOW),
    })
    expect(found).toEqual([{ _id: 'talk-before', conferenceId: 'conf-before' }])
  })
})

describe('foldCutoff', () => {
  it.each([
    ['2026-10-21T04:40:00.000Z', '2024-10-21'],
    ['2026-01-01T00:00:00.000Z', '2024-01-01'],
    ['2026-12-31T23:59:59.999Z', '2024-12-31'],
    ['2026-03-31T12:00:00.000Z', '2024-03-31'],
  ])('24 calendar months before %s is %s', (now, cutoff) => {
    expect(foldCutoff(new Date(now))).toBe(cutoff)
  })
})
