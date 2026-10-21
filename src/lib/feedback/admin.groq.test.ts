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
  revs: 0,
  /** What GROQ sees when it lags the doc endpoint; null means no lag. */
  groqSnapshot: null as null | (Record<string, unknown> & { _id: string })[],
  /** How many ids each doc-endpoint read asked for. */
  docReads: [] as number[],
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
    return (
      await evaluate(parse(query), {
        dataset: h.groqSnapshot ?? h.dataset,
        params,
      })
    ).get()
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
      // A failed revision guard rolls the whole transaction back with 409.
      if (m.patch.ifRevisionID && m.patch.ifRevisionID !== next[i]._rev)
        throw Object.assign(new Error('Revision mismatch'), {
          statusCode: 409,
        })
      next[i] = {
        ...new Mutation({ mutations: [m] }).apply(next[i])!,
        _rev: `rev-${++h.revs}`,
      }
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
      // The doc endpoint: never lags.
      getDocuments: async (ids: string[]) => {
        h.docReads.push(ids.length)
        return ids.map((id) =>
          structuredClone(h.dataset.find((d) => d._id === id) ?? null),
        )
      },
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
  readTalkFeedback,
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
  _rev: `rev-r${n}`,
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
  h.revs = 0
  h.groqSnapshot = null
  h.docReads = []
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
  it('gives a format it does not know as none', async () => {
    h.dataset.push(talk('talk-odd', { format: 'keynote_90' }))
    const out = await read()
    expect(out.sessions.find((s) => s.talkId === 'talk-odd')!.format).toBeNull()
    expect(out.sessions.find((s) => s.talkId === 'talk-a')!.format).toBe(
      'presentation_40',
    )
  })

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
  // A comment's Remove: each response as the page showed it.
  remove: (responseIds: string[]) =>
    removeResponses({
      conferenceId: 'conf-A',
      responses: responseIds.map((id) => ({
        id,
        submittedAt:
          (h.dataset.find((d) => d._id === id)?.submittedAt as string) ?? null,
      })),
    }),
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

describe('Hide and Unhide racing the device’s own Delete', () => {
  for (const action of ['hide', 'unhide'] as const) {
    it(`${action} answers a response deleted before its commit as refused, not as an error`, async () => {
      const r = response('talk-a', 'red', { comment: 'x', hiddenAt: 'then' })
      h.dataset.push(r)
      // The attendee's Delete my answer lands between the guard and the patch.
      h.beforeCommit.push(() => {
        h.dataset = h.dataset.filter((d) => d._id !== r._id)
      })
      expect(await act[action]([r._id])).toEqual({ status: 'refused' })
      expect(h.commits).toEqual([])
    })
  }

  it('still fails on any other commit error', async () => {
    const r = response('talk-a', 'red', { comment: 'x' })
    h.dataset.push(r)
    h.beforeCommit.push(() => {
      throw Object.assign(new Error('503'), { statusCode: 503 })
    })
    await expect(act.hide([r._id])).rejects.toThrow('503')
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
    expect(await act.remove(ids)).toEqual({
      status: 'ok',
      removed: 250,
      gone: 0,
      changed: 0,
    })
    // Each delete goes with its revision guard: two mutations a response.
    expect(
      h.commits.map((c) => c.filter((m) => 'delete' in (m as object)).length),
    ).toEqual([100, 100, 50])
    expect(ids.filter((id) => doc(id))).toEqual([])
    expect(doc(keep._id)).toBeDefined()
    expect(vi.mocked(revalidateTag).mock.calls).toEqual(
      ids.map((id) => [feedbackResponseTag(id), { expire: 0 }]),
    )
  })

  it('reports what was removed when a later chunk fails, and expires the failed chunk too', async () => {
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
    expect(await act.remove(ids)).toMatchObject({
      status: 'failed',
      removed: 100,
    })
    expect(ids.filter((id) => doc(id))).toEqual(ids.slice(100))
    // A commit whose reply was lost may have applied: the failed chunk's
    // entries are expired too, which is harmless for a live response.
    expect(vi.mocked(revalidateTag).mock.calls).toEqual(
      ids.map((id) => [feedbackResponseTag(id), { expire: 0 }]),
    )
  })

  it('removes a duplicated id once', async () => {
    const r = response('talk-a', 'green')
    h.dataset.push(r)
    expect(await act.remove([r._id, r._id])).toEqual({
      status: 'ok',
      removed: 1,
      gone: 0,
      changed: 0,
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
      'a response that points at a draft of one of our talks',
      () => {
        h.dataset.push(talk('drafts.talk-a'))
        return response('drafts.talk-a', 'red', { comment: 'x' })
      },
    ],
    [
      'a Content Release version of a response',
      () => ({
        ...response('talk-a', 'red', { comment: 'x' }),
        _id: `versions.r1.${rid(98)}`,
      }),
    ],
    [
      'a draft response',
      () => ({
        ...response('talk-a', 'red', { comment: 'x' }),
        _id: `drafts.${rid(99)}`,
      }),
    ],
  ]

  for (const action of ['hide', 'unhide'] as const) {
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

describe('Remove skips what is not ours, before any write (§10.3)', () => {
  it.each([
    [
      'a response of another conference',
      () => {
        h.dataset.push(talk('talk-foreign', { conference: ref('conf-B') }))
        return response('talk-foreign', 'red', { conference: ref('conf-B') })
      },
    ],
    [
      'a response whose talk belongs to another conference',
      () => {
        h.dataset.push(talk('talk-foreign', { conference: ref('conf-B') }))
        return response('talk-foreign', 'red')
      },
    ],
    [
      'a response that points at a draft of one of our talks',
      () => {
        h.dataset.push(talk('drafts.talk-a'))
        return response('drafts.talk-a', 'red')
      },
    ],
    [
      'a draft response',
      () => ({
        ...response('talk-a', 'red'),
        _id: `drafts.${rid(99)}`,
      }),
    ],
  ])(
    'never deletes %s, counting it gone like a missing one',
    async (_, make) => {
      const ours = response('talk-a', 'green')
      const bad = make()
      h.dataset.push(ours, bad)
      expect(await act.remove([ours._id, bad._id])).toEqual({
        status: 'ok',
        removed: 1,
        gone: 1,
        changed: 0,
      })
      expect(doc(bad._id)).toBeDefined()
      expect(doc(ours._id)).toBeUndefined()
      // Alone, it is answered exactly as an id that does not exist.
      const a = await act.remove([bad._id])
      expect(a).toEqual(await act.remove([rid(12345)]))
      expect(doc(bad._id)).toBeDefined()
    },
  )
})

describe('Remove of one comment: only the answer the organizer saw (§10.3)', () => {
  it('keeps a replacement answer given while the confirmation was open', async () => {
    const shown = response('talk-a', 'red', { comment: 'awful' })
    h.dataset.push(shown)
    const seen = { id: shown._id, submittedAt: String(shown.submittedAt) }
    // The same device answers again: same id, new answer.
    h.dataset = h.dataset.map((d) =>
      d._id === shown._id
        ? {
            ...d,
            colour: 'green',
            comment: 'great',
            submittedAt: '2026-06-10T10:50:00Z',
            _rev: 'again',
          }
        : d,
    )
    expect(
      await removeResponses({ conferenceId: 'conf-A', responses: [seen] }),
    ).toEqual({ status: 'ok', removed: 0, gone: 0, changed: 1 })
    expect(doc(shown._id)).toMatchObject({ comment: 'great' })
    expect(h.commits).toEqual([])
  })

  it('keeps a replacement given between the guard read and the commit', async () => {
    const shown = response('talk-a', 'red', { comment: 'awful' })
    h.dataset.push(shown)
    h.beforeCommit.push(() => {
      h.dataset = h.dataset.map((d) =>
        d._id === shown._id ? { ...d, comment: 'great', _rev: 'again' } : d,
      )
    })
    expect(
      await removeResponses({
        conferenceId: 'conf-A',
        responses: [{ id: shown._id, submittedAt: String(shown.submittedAt) }],
      }),
    ).toEqual({ status: 'ok', removed: 0, gone: 0, changed: 1 })
    expect(doc(shown._id)).toMatchObject({ comment: 'great' })
  })

  it('matches a response the page showed without a time', async () => {
    const timeless = response('talk-a', 'red', { submittedAt: undefined })
    h.dataset.push(timeless)
    expect(
      await removeResponses({
        conferenceId: 'conf-A',
        responses: [{ id: timeless._id, submittedAt: null }],
      }),
    ).toMatchObject({ removed: 1 })
  })
})

describe('Remove a range (§10.2): only the answers the organizer saw', () => {
  // The burst sits in 10:00–10:30 on 2026-06-10.
  const FROM = '2026-06-10T10:00:00.000Z'
  const TO = '2026-06-10T10:30:00.000Z'
  const seen = (d: Doc) => ({ id: d._id, submittedAt: String(d.submittedAt) })
  const range = (
    docs: Doc[],
    extra: { id: string; submittedAt: string }[] = [],
  ) =>
    removeResponses({
      conferenceId: 'conf-A',
      range: { from: FROM, to: TO },
      responses: [...docs.map(seen), ...extra],
    })
  const burst = (k: number) =>
    Array.from({ length: k }, () =>
      response('talk-a', 'red', { submittedAt: '2026-06-10T10:15:00Z' }),
    )

  it('removes the range, and counts one already gone as gone', async () => {
    const docs = burst(3)
    h.dataset.push(...docs)
    // The attendee deleted their own answer after the chart was read.
    h.dataset = h.dataset.filter((d) => d._id !== docs[1]._id)
    expect(await range(docs)).toEqual({
      status: 'ok',
      removed: 2,
      gone: 1,
      changed: 0,
    })
    expect(docs.filter((r) => doc(r._id))).toEqual([])
  })

  it('keeps an answer the attendee changed after the chart was read (same id, new time)', async () => {
    const docs = burst(2)
    h.dataset.push(...docs)
    const [kept] = docs
    // A resubmit from the same device: same deterministic id, new answer.
    h.dataset = h.dataset.map((d) =>
      d._id === kept._id
        ? {
            ...d,
            colour: 'green',
            submittedAt: '2026-06-10T11:00:00Z',
            _rev: 'resubmitted',
          }
        : d,
    )
    expect(await range(docs)).toMatchObject({ removed: 1, changed: 1 })
    expect(doc(kept._id)).toMatchObject({ colour: 'green' })
  })

  it('keeps an answer given again inside the range while the confirmation was open', async () => {
    const docs = burst(2)
    h.dataset.push(...docs)
    const [kept] = docs
    // The range includes the current bucket: the new answer lands in it.
    h.dataset = h.dataset.map((d) =>
      d._id === kept._id
        ? {
            ...d,
            colour: 'green',
            submittedAt: '2026-06-10T10:20:00Z',
            _rev: 'resubmitted',
          }
        : d,
    )
    expect(await range(docs)).toMatchObject({ removed: 1, changed: 1 })
    expect(doc(kept._id)).toMatchObject({ colour: 'green' })
  })

  it('keeps an answer changed between the guard read and the commit (the revision guard)', async () => {
    const docs = burst(3)
    h.dataset.push(...docs)
    const [, changed] = docs
    h.beforeCommit.push(() => {
      h.dataset = h.dataset.map((d) =>
        d._id === changed._id
          ? {
              ...d,
              comment: 'actually great',
              submittedAt: '2026-06-10T10:29:00Z',
              _rev: 'edited',
            }
          : d,
      )
    })
    expect(await range(docs)).toEqual({
      status: 'ok',
      removed: 2,
      gone: 0,
      changed: 1,
    })
    expect(doc(changed._id)).toMatchObject({ comment: 'actually great' })
    // Each delete went with its revision guard: Studio’s pseudo-field unset.
    expect(h.commits.at(-1)).toContainEqual({
      patch: {
        id: docs[0]._id,
        ifRevisionID: docs[0]._rev,
        unset: ['_revision_lock_pseudo_field_'],
      },
    })
  })

  it('counts an answer deleted between the guard read and the commit as gone, not removed', async () => {
    const docs = burst(2)
    h.dataset.push(...docs)
    h.beforeCommit.push(() => {
      h.dataset = h.dataset.filter((d) => d._id !== docs[0]._id)
    })
    expect(await range(docs)).toEqual({
      status: 'ok',
      removed: 1,
      gone: 1,
      changed: 0,
    })
  })

  it('keeps an answer whose time is outside the range, whatever the client says it saw', async () => {
    const outside = response('talk-a', 'red', {
      submittedAt: '2026-06-10T11:00:00Z',
    })
    h.dataset.push(outside)
    expect(await range([outside])).toMatchObject({ removed: 0, changed: 1 })
    expect(doc(outside._id)).toBeDefined()
  })

  it('never deletes a foreign, draft or draft-talk response: each is skipped like a missing one', async () => {
    h.dataset.push(
      talk('talk-foreign', { conference: ref('conf-B') }),
      talk('drafts.talk-a'),
      talk('versions.r1.talk-a'),
    )
    const foreign = response('talk-foreign', 'red', {
      conference: ref('conf-B'),
    })
    // Claims this conference; its talk is another's.
    const disguised = response('talk-foreign', 'red')
    const draft = { ...response('talk-a', 'red'), _id: `drafts.${rid(97)}` }
    // Points at a draft or a release version of our own talk.
    const onDraftTalk = response('drafts.talk-a', 'red')
    const onReleaseTalk = response('versions.r1.talk-a', 'red')
    const ours = response('talk-a', 'red')
    h.dataset.push(foreign, disguised, draft, onDraftTalk, onReleaseTalk, ours)
    const out = await range(
      [foreign, disguised, draft, onDraftTalk, onReleaseTalk, ours],
      [{ id: rid(54321), submittedAt: '2026-06-10T10:05:00Z' }],
    )
    expect(out).toEqual({ status: 'ok', removed: 1, gone: 6, changed: 0 })
    for (const d of [foreign, disguised, draft, onDraftTalk, onReleaseTalk])
      expect(doc(d._id)).toBeDefined()
    expect(doc(ours._id)).toBeUndefined()
    // Only ours was in a transaction, and only its tag expired.
    expect(h.commits.flat().map((m) => JSON.stringify(m))).toEqual([
      JSON.stringify({
        patch: {
          id: ours._id,
          ifRevisionID: ours._rev,
          unset: ['_revision_lock_pseudo_field_'],
        },
      }),
      JSON.stringify({ delete: { id: ours._id } }),
    ])
    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      [feedbackResponseTag(ours._id), { expire: 0 }],
    ])
  })

  it('writes nothing when the whole range is gone', async () => {
    expect(
      await range([], [{ id: rid(1), submittedAt: '2026-06-10T10:05:00Z' }]),
    ).toEqual({ status: 'ok', removed: 0, gone: 1, changed: 0 })
    expect(h.commits).toEqual([])
  })

  it('reports what was removed when a later chunk fails', async () => {
    const docs = burst(150)
    h.dataset.push(...docs)
    h.beforeCommit.push(
      () => {},
      () => {
        throw new Error('503')
      },
    )
    expect(await range(docs)).toEqual({
      status: 'failed',
      removed: 100,
      gone: 0,
      changed: 0,
    })
  })

  it('re-plans a chunk without an answer that keeps changing, and removes the rest', async () => {
    const docs = burst(2)
    h.dataset.push(...docs)
    // Someone keeps changing the second answer, each time inside the range.
    for (let k = 0; k < 10; k++)
      h.beforeCommit.push(() => {
        h.dataset = h.dataset.map((d) =>
          d._id === docs[1]._id ? { ...d, _rev: `typing-${k}` } : d,
        )
      })
    const out = await range(docs)
    expect(out).toMatchObject({ status: 'ok', removed: 1, changed: 1 })
    expect(doc(docs[1]._id)).toBeDefined()
    expect(doc(docs[0]._id)).toBeUndefined()
  })

  it('gives up, as failed, when a guard keeps failing with nothing to drop', async () => {
    const docs = burst(2)
    h.dataset.push(...docs)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (let k = 0; k < 10; k++)
      h.beforeCommit.push(() => {
        throw Object.assign(new Error('Revision mismatch'), { statusCode: 409 })
      })
    expect(await range(docs)).toMatchObject({ status: 'failed', removed: 0 })
    error.mockRestore()
    // Bounded: the first try and three re-plans.
    expect(h.beforeCommit).toHaveLength(6)
    expect(docs.filter((d) => doc(d._id))).toHaveLength(2)
  })
})

describe('Remove a range: bounds, lag and lost replies (§10.2)', () => {
  const FROM = '2026-06-10T10:00:00.000Z'
  const TO = '2026-06-10T10:30:00.000Z'
  const seen = (d: Doc) => ({ id: d._id, submittedAt: String(d.submittedAt) })
  const range = (docs: Doc[]) =>
    removeResponses({
      conferenceId: 'conf-A',
      range: { from: FROM, to: TO },
      responses: docs.map(seen),
    })
  const at = (submittedAt: string) => response('talk-a', 'red', { submittedAt })
  const burst = (k: number) =>
    Array.from({ length: k }, () => at('2026-06-10T10:15:00Z'))

  it('keeps an answer just before the start, and one exactly at the end', async () => {
    const before = at('2026-06-10T09:59:59Z')
    const first = at('2026-06-10T10:00:00Z')
    const last = at('2026-06-10T10:29:59Z')
    const end = at('2026-06-10T10:30:00Z')
    h.dataset.push(before, first, last, end)
    expect(await range([before, first, last, end])).toEqual({
      status: 'ok',
      removed: 2,
      gone: 0,
      changed: 2,
    })
    expect(doc(before._id)).toBeDefined()
    expect(doc(end._id)).toBeDefined()
    expect(doc(first._id)).toBeUndefined()
    expect(doc(last._id)).toBeUndefined()
  })

  it('re-plans by id, not through lagging GROQ, when one answer changes during a 150-response burst', async () => {
    const docs = burst(150)
    h.dataset.push(...docs)
    // GROQ shows the dataset as it was for the whole request.
    h.groqSnapshot = structuredClone(h.dataset)
    h.beforeCommit.push(() => {
      h.dataset = h.dataset.map((d) =>
        d._id === docs[5]._id
          ? {
              ...d,
              colour: 'green',
              submittedAt: '2026-06-10T11:00:00Z',
              _rev: 'retap',
            }
          : d,
      )
    })
    expect(await range(docs)).toEqual({
      status: 'ok',
      removed: 149,
      gone: 0,
      changed: 1,
    })
    expect(docs.filter((d) => doc(d._id)).map((d) => d._id)).toEqual([
      docs[5]._id,
    ])
    // The first chunk's 100 ids re-read in requests of at most 50.
    expect(h.docReads).toEqual([50, 50])
  })

  it('re-plans by id when one answer is deleted during the burst (404), GROQ lagging', async () => {
    const docs = burst(150)
    h.dataset.push(...docs)
    h.groqSnapshot = structuredClone(h.dataset)
    h.beforeCommit.push(() => {
      h.dataset = h.dataset.filter((d) => d._id !== docs[5]._id)
    })
    expect(await range(docs)).toEqual({
      status: 'ok',
      removed: 149,
      gone: 1,
      changed: 0,
    })
  })

  it('expires a failed chunk’s answers too: a commit whose reply was lost may have applied', async () => {
    const docs = burst(150)
    h.dataset.push(...docs)
    h.beforeCommit.push(
      () => {},
      () => {
        throw new Error('503')
      },
    )
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await range(docs)).toMatchObject({ status: 'failed', removed: 100 })
    error.mockRestore()
    expect(vi.mocked(revalidateTag).mock.calls).toEqual(
      docs.map((d) => [feedbackResponseTag(d._id), { expire: 0 }]),
    )
  })
})

describe('readTalkFeedback — one talk’s panel (§10.2)', () => {
  const CONF = { _id: 'conf-A', endDate: '2026-06-11' }
  const readTalk = (talkId: string) =>
    readTalkFeedback({ conference: CONF, talkId, now: NOW })

  it('gives the talk’s totals from the one totals function, its comments, and every response for the chart', async () => {
    h.dataset.push(
      response('talk-a', 'green', { comment: 'Great demo' }),
      response('talk-a', 'red', { comment: 'Rude', hiddenAt: 'x' }),
      response('talk-a', 'yellow'),
      response('talk-b', 'red'),
    )
    const out = (await readTalk('talk-a'))!
    // 1 live green + 1 folded + 3 cards; 1 yellow live + 1 card; 1 red live.
    expect(out.totals.combined).toEqual({ green: 5, yellow: 2, red: 1 })
    expect(out.totals.scanned).toEqual({ green: 2, yellow: 1, red: 1 })
    expect(out.totals.cards).toEqual({ green: 3, yellow: 1, red: 0 })
    expect(out.comments.map((c) => [c.comment, c.hidden])).toEqual([
      ['Great demo', false],
      ['Rude', true],
    ])
    expect(out.responses).toEqual([
      { id: rid(1), colour: 'green', submittedAt: '2026-06-10T10:01:30Z' },
      { id: rid(2), colour: 'red', submittedAt: '2026-06-10T10:02:30Z' },
      { id: rid(3), colour: 'yellow', submittedAt: '2026-06-10T10:03:30Z' },
    ])
    // 09:00–09:40 Oslo (CEST), open until 24 hours after.
    expect(out.window).toMatchObject({
      state: 'open',
      opensAt: '2026-06-10T07:00:00.000Z',
      closesAt: '2026-06-11T07:40:00.000Z',
    })
  })

  it('gives the time the Card Counts were last saved, so a save can tell when a read has caught up', async () => {
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-a'
        ? {
            ...d,
            audienceFeedback: {
              greenCount: 3,
              yellowCount: 1,
              redCount: 0,
              lastUpdatedAt: '2026-06-10T12:00:00.000Z',
            },
          }
        : d,
    )
    expect((await readTalk('talk-a'))!.cardsSavedAt).toBe(
      '2026-06-10T12:00:00.000Z',
    )
    expect((await readTalk('talk-b'))!.cardsSavedAt).toBeNull()
  })

  it('orders responses by time, not by id', async () => {
    h.dataset.push(
      response('talk-a', 'green', { submittedAt: '2026-06-10T11:00:00Z' }),
      response('talk-a', 'red', { submittedAt: '2026-06-10T09:30:00Z' }),
    )
    const out = (await readTalk('talk-a'))!
    expect(out.responses.map((r) => r.id)).toEqual([rid(2), rid(1)])
  })

  it('reads published documents of this conference only (§4.4), never through the CDN', async () => {
    h.dataset.push(
      response('talk-a', 'green'),
      { ...response('talk-a', 'red'), _id: `drafts.${rid(90)}` },
      { ...response('talk-a', 'red'), _id: `versions.r1.${rid(91)}` },
      // A response filed under another conference, pointing at this talk.
      response('talk-a', 'yellow', { conference: ref('conf-B') }),
      talk('drafts.talk-a', {
        audienceFeedback: { greenCount: 99, yellowCount: 0, redCount: 0 },
      }),
    )
    const out = (await readTalk('talk-a'))!
    expect(out.totals.scanned).toEqual({ green: 2, yellow: 0, red: 0 })
    expect(out.totals.cards.green).toBe(3)
    expect(out.responses.map((r) => r.id)).toEqual([rid(1)])
    expect(h.cdnQueries).toEqual([])
  })

  it('answers another conference’s talk, a draft-only talk and a missing one alike, reading no response', async () => {
    h.dataset.push(
      talk('talk-foreign', { conference: ref('conf-B') }),
      response('talk-foreign', 'green', { conference: ref('conf-B') }),
      talk('drafts.talk-new'),
    )
    for (const talkId of [
      'talk-foreign',
      'talk-missing',
      'drafts.talk-new',
      'talk-new',
    ]) {
      h.queries = []
      expect(await readTalk(talkId)).toBeNull()
      expect(h.queries).toHaveLength(1)
      expect(h.queries[0]).not.toContain('feedbackResponse')
    }
  })

  it('leaves a response with an unknown colour or no time out of the chart', async () => {
    h.dataset.push(
      response('talk-a', 'purple', { comment: 'Odd' }),
      response('talk-a', 'green', { submittedAt: null }),
    )
    const out = (await readTalk('talk-a'))!
    expect(out.responses).toEqual([])
    expect(out.totals.scanned.green).toBe(2)
  })
})
