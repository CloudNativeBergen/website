/**
 * @vitest-environment node
 *
 * The organizers' Session Feedback (speaker feedback spec §4.3, §4.4, §10.1,
 * §10.3) on GROQ EXECUTED with groq-js against an in-memory dataset. Writes
 * go through a REAL `@sanity/client` transaction, serialized and applied with
 * the real `@sanity/mutator`, all or nothing, so a test sees what Sanity
 * would store. Each query and each commit is logged, so a refusal can be
 * shown to happen before anything is written.
 */
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

type Doc = Record<string, unknown> & { _id: string }

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  queries: [] as string[],
  /** Queries sent through the CDN client: none may be. */
  cdnQueries: [] as string[],
  /** Each committed transaction's mutations. */
  commits: [] as unknown[][],
  /** Runs once, just before the next commit; may throw to fail it. */
  beforeCommit: [] as (() => void)[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  const fetch = async (query: string, params: Record<string, unknown> = {}) => {
    h.queries.push(query)
    return (await evaluate(parse(query), { dataset: h.dataset, params })).get()
  }
  const { Mutation } = createRequire(
    createRequire(import.meta.url).resolve('sanity/package.json'),
  )('@sanity/mutator') as {
    Mutation: new (o: { mutations: unknown[] }) => {
      apply: (doc: Doc | null) => Doc | null
    }
  }
  async function commit(mutations: Record<string, Record<string, unknown>>[]) {
    h.beforeCommit.shift()?.()
    // All or nothing, as a Sanity transaction is.
    const next = structuredClone(h.dataset)
    for (const m of mutations) {
      const id = String((m.patch ?? m.delete)?.id)
      const i = next.findIndex((d) => d._id === id)
      if (m.delete) {
        if (i >= 0) next.splice(i, 1)
        continue
      }
      // Sanity answers a patch of a missing document with 404 and rolls the
      // transaction back.
      if (!m.patch || i < 0)
        throw Object.assign(new Error(`${id} not found`), { statusCode: 404 })
      next[i] = new Mutation({ mutations: [m] }).apply(next[i])!
    }
    h.dataset = next
    h.commits.push(mutations)
    return { results: [] }
  }
  return {
    clientReadUncached: { fetch },
    clientReadCached: {
      fetch: (q: string, p?: Record<string, unknown>) => {
        h.cdnQueries.push(q)
        return fetch(q, p)
      },
    },
    clientWrite: {
      fetch,
      transaction: () => {
        const tx = real.transaction()
        tx.commit = (async () =>
          commit(
            tx.serialize() as Record<string, Record<string, unknown>>[],
          )) as unknown as typeof tx.commit
        return tx
      },
    },
  }
})

import { revalidateTag } from 'next/cache'
import { feedbackResponseTag } from '@/lib/cache/tags'
import {
  hideResponses,
  readAdminFeedback,
  removeResponses,
  unhideResponses,
} from './admin'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const talk = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _type: 'talk',
  title: id,
  status: 'confirmed',
  format: 'presentation_40',
  conference: ref('conf-A'),
  speakers: [ref('sp-ada')],
  ...fields,
})
let n = 0
/** A deterministic-looking response id, as `feedbackResponseId` makes them. */
const rid = (i: number) => `feedbackResponse-${String(i).padStart(32, '0')}`
const response = (
  talkId: string,
  colour: string,
  fields: Record<string, unknown> = {},
): Doc => ({
  _id: rid(++n),
  _type: 'feedbackResponse',
  talk: ref(talkId),
  conference: ref('conf-A'),
  colour,
  submittedAt: `2026-06-10T10:${String(n).padStart(2, '0')}:30Z`,
  ...fields,
})
const SCHEDULE: Doc = {
  _id: 'day-1',
  _type: 'schedule',
  conference: ref('conf-A'),
  status: 'official',
  date: '2026-06-10',
  tracks: [
    {
      _key: 't',
      talks: [
        {
          _key: 'a',
          talk: ref('talk-a'),
          startTime: '09:00',
          endTime: '09:40',
        },
      ],
    },
  ],
}
const doc = (id: string) => h.dataset.find((d) => d._id === id)
const NOW = new Date('2026-06-10T12:00:00Z')
const read = () => readAdminFeedback({ conferenceId: 'conf-A', now: NOW })

beforeEach(() => {
  n = 0
  h.queries = []
  h.cdnQueries = []
  h.commits = []
  h.beforeCommit = []
  vi.mocked(revalidateTag).mockClear()
  h.dataset = [
    SCHEDULE,
    { _id: 'sp-ada', _type: 'speaker', name: 'Ada Lovelace' },
    { _id: 'sp-bo', _type: 'speaker', name: 'Bo Ek' },
    talk('talk-a', {
      title: 'Kubernetes the hard way',
      speakers: [ref('sp-ada'), ref('sp-bo')],
      audienceFeedback: { greenCount: 3, yellowCount: 1, redCount: 0 },
      feedbackFolded: { greenCount: 1, yellowCount: 0, redCount: 0 },
    }),
    talk('talk-b', { title: 'eBPF in five minutes' }),
  ]
})

describe('readAdminFeedback (§10.1)', () => {
  it('lists every confirmed talk with its totals from the one totals function (§4.3)', async () => {
    h.dataset.push(
      response('talk-a', 'green'),
      response('talk-a', 'red', { comment: 'Too fast', hiddenAt: 'x' }),
      response('talk-b', 'yellow'),
    )
    const out = await read()
    const a = out.sessions.find((s) => s.talkId === 'talk-a')!
    // 1 live green + 1 folded + 3 cards = 5 green; 1 yellow card; 1 red.
    expect(a.totals.combined).toEqual({ green: 5, yellow: 1, red: 1 })
    expect(a.totals.scanned).toEqual({ green: 2, yellow: 0, red: 1 })
    expect(a.totals.cardsTotal).toBe(4)
    expect(a).toMatchObject({
      title: 'Kubernetes the hard way',
      speakers: ['Ada Lovelace', 'Bo Ek'],
      format: 'presentation_40',
      // 09:00 Oslo (CEST) on 2026-06-10.
      slotAt: '2026-06-10T07:00:00.000Z',
    })
    const b = out.sessions.find((s) => s.talkId === 'talk-b')!
    expect(b.totals.combined).toEqual({ green: 0, yellow: 1, red: 0 })
    expect(b.slotAt).toBeNull()
  })
})

describe('readAdminFeedback — what is read', () => {
  it('reads published documents of this conference only (§4.4), never through the CDN', async () => {
    h.dataset.push(
      response('talk-a', 'green'),
      // A draft response and a draft talk must not count.
      { ...response('talk-a', 'red'), _id: `drafts.${rid(90)}` },
      talk('drafts.talk-a', { title: 'Draft title' }),
      talk('versions.r1.talk-b', { title: 'Release title' }),
      // Another conference's talk and response.
      talk('talk-foreign', { conference: ref('conf-B') }),
      response('talk-foreign', 'green', { conference: ref('conf-B') }),
    )
    const out = await read()
    expect(out.sessions.map((s) => s.talkId).sort()).toEqual([
      'talk-a',
      'talk-b',
    ])
    expect(out.sessions.find((s) => s.talkId === 'talk-a')!.title).toBe(
      'Kubernetes the hard way',
    )
    expect(
      out.sessions.find((s) => s.talkId === 'talk-a')!.totals.scanned,
    ).toEqual({ green: 2, yellow: 0, red: 0 })
    expect(h.cdnQueries).toEqual([])
  })

  it('leaves out an unconfirmed talk with no responses, but keeps a withdrawn one that still holds some', async () => {
    h.dataset.push(
      talk('talk-accepted', { status: 'accepted' }),
      talk('talk-withdrawn', { status: 'withdrawn' }),
      response('talk-withdrawn', 'red', { comment: 'Spam spam' }),
    )
    const ids = (await read()).sessions.map((s) => s.talkId).sort()
    expect(ids).toEqual(['talk-a', 'talk-b', 'talk-withdrawn'])
  })

  it('shows organizers every comment oldest first, hidden ones marked, empty ones left out', async () => {
    h.dataset.push(
      response('talk-a', 'green', { comment: 'Great demo' }),
      response('talk-a', 'red', { comment: 'Rude remark', hiddenAt: 'x' }),
      response('talk-a', 'yellow', { comment: '   ' }),
      response('talk-a', 'yellow', { comment: 'Flagged one', flaggedAt: 'x' }),
    )
    const out = await read()
    const a = out.sessions.find((s) => s.talkId === 'talk-a')!
    expect(a.comments).toEqual([
      {
        id: rid(1),
        colour: 'green',
        comment: 'Great demo',
        submittedAt: '2026-06-10T10:01:30Z',
        hidden: false,
        flagged: false,
      },
      expect.objectContaining({ id: rid(2), hidden: true, flagged: false }),
      expect.objectContaining({ id: rid(4), hidden: false, flagged: true }),
    ])
    // The empty comment's colour still counts.
    expect(a.totals.scanned.yellow).toBe(2)
  })

  it('adds the stat cards up across sessions: responses, loved it, comments, flagged', async () => {
    h.dataset.push(
      response('talk-a', 'green', { comment: 'A' }),
      response('talk-b', 'red', { comment: 'B', flaggedAt: 'x' }),
      response('talk-b', 'red'),
    )
    const out = await read()
    // talk-a: 1 live + 1 folded + 3 cards green, 1 yellow card; talk-b: 2 red.
    expect(out.totals.combined).toEqual({ green: 5, yellow: 1, red: 2 })
    expect(out.totals.total).toBe(8)
    expect(out.totals.lovedItPercent).toBe(63)
    expect(out.comments).toBe(2)
    expect(out.flagged).toBe(1)
  })
})

const act = {
  hide: (responseIds: string[]) =>
    hideResponses({ conferenceId: 'conf-A', responseIds, now: NOW }),
  unhide: (responseIds: string[]) =>
    unhideResponses({ conferenceId: 'conf-A', responseIds }),
  remove: (responseIds: string[]) =>
    removeResponses({ conferenceId: 'conf-A', responseIds }),
}

describe('Hide and Unhide (§10.3)', () => {
  it('Hide sets hiddenAt and clears flaggedAt; the colour stays', async () => {
    const r = response('talk-a', 'red', { comment: 'x', flaggedAt: 'then' })
    h.dataset.push(r)
    expect(await act.hide([r._id])).toEqual({ status: 'ok', count: 1 })
    expect(doc(r._id)).toMatchObject({
      hiddenAt: NOW.toISOString(),
      colour: 'red',
      comment: 'x',
    })
    expect(doc(r._id)).not.toHaveProperty('flaggedAt')
  })

  it('Unhide clears hiddenAt and nothing else', async () => {
    const r = response('talk-a', 'red', { comment: 'x', hiddenAt: 'then' })
    h.dataset.push(r)
    expect(await act.unhide([r._id])).toEqual({ status: 'ok', count: 1 })
    expect(doc(r._id)).not.toHaveProperty('hiddenAt')
    expect(doc(r._id)).toMatchObject({ colour: 'red', comment: 'x' })
  })
})

describe('Remove (§10.3)', () => {
  it('deletes each response, in transactions of at most 100, and expires each one’s tag', async () => {
    const ids: string[] = []
    for (let i = 0; i < 250; i++) {
      const r = response('talk-a', 'green')
      h.dataset.push(r)
      ids.push(r._id)
    }
    const keep = response('talk-a', 'red')
    h.dataset.push(keep)
    expect(await act.remove(ids)).toEqual({ status: 'ok', removed: 250 })
    expect(h.commits.map((c) => c.length)).toEqual([100, 100, 50])
    expect(ids.filter((id) => doc(id))).toEqual([])
    expect(doc(keep._id)).toBeDefined()
    expect(vi.mocked(revalidateTag).mock.calls).toEqual(
      ids.map((id) => [feedbackResponseTag(id), { expire: 0 }]),
    )
  })

  it('reports what was removed when a later chunk fails, expiring only those', async () => {
    const ids: string[] = []
    for (let i = 0; i < 150; i++) {
      const r = response('talk-a', 'green')
      h.dataset.push(r)
      ids.push(r._id)
    }
    h.beforeCommit.push(
      () => {},
      () => {
        throw new Error('503')
      },
    )
    expect(await act.remove(ids)).toEqual({ status: 'failed', removed: 100 })
    expect(ids.filter((id) => doc(id))).toEqual(ids.slice(100))
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledTimes(100)
  })

  it('removes a duplicated id once', async () => {
    const r = response('talk-a', 'green')
    h.dataset.push(r)
    expect(await act.remove([r._id, r._id])).toEqual({
      status: 'ok',
      removed: 1,
    })
  })
})

describe('every action — refused before any write (§10.3)', () => {
  const foreignTalk = () => {
    h.dataset.push(talk('talk-foreign', { conference: ref('conf-B') }))
    return response('talk-foreign', 'red', {
      comment: 'x',
      conference: ref('conf-B'),
    })
  }
  const cases: [string, () => Doc][] = [
    ['a response of another conference', foreignTalk],
    [
      // The response claims this conference, its talk is another's.
      'a response whose talk belongs to another conference',
      () => {
        h.dataset.push(talk('talk-foreign', { conference: ref('conf-B') }))
        return response('talk-foreign', 'red', { comment: 'x' })
      },
    ],
    [
      'a response whose talk does not exist',
      () => response('talk-gone', 'red', { comment: 'x' }),
    ],
    [
      'a draft response',
      () => ({
        ...response('talk-a', 'red', { comment: 'x' }),
        _id: `drafts.${rid(99)}`,
      }),
    ],
  ]

  for (const action of ['hide', 'unhide', 'remove'] as const) {
    it.each(cases)(
      `${action} refuses %s, together with an id of ours, writing nothing`,
      async (_, make) => {
        const ours = response('talk-a', 'green', {
          comment: 'ours',
          hiddenAt: 'then',
        })
        const bad = make()
        h.dataset.push(ours, bad)
        const before = structuredClone(h.dataset)
        expect(await act[action]([ours._id, bad._id])).toEqual({
          status: 'refused',
        })
        expect(h.commits).toEqual([])
        expect(h.dataset).toEqual(before)
        expect(revalidateTag).not.toHaveBeenCalled()
      },
    )

    it(`${action} answers a foreign id exactly as a nonexistent one`, async () => {
      const foreign = foreignTalk()
      h.dataset.push(foreign)
      const a = await act[action]([foreign._id])
      const b = await act[action]([rid(12345)])
      expect(a).toEqual({ status: 'refused' })
      expect(b).toEqual(a)
      expect(h.commits).toEqual([])
    })
  }
})
