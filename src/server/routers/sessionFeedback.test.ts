/**
 * @vitest-environment node
 *
 * `sessionFeedback.ensureCode` (speaker feedback spec §4.2, §5, §9.1) through
 * the tRPC caller. Every GROQ read is EXECUTED with groq-js, every write is
 * built by the REAL `@sanity/client` transaction builder and applied with
 * Sanity's REAL patch semantics (`@sanity/mutator`). Only the network is
 * replaced, by a store that also refuses what Sanity refuses: a revision
 * mismatch rolls back the whole transaction.
 */
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

type Doc = Record<string, unknown> & { _id: string; _rev?: string }

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string; _rev?: string })[],
  releases: [] as { name: string; state: string }[],
  /** The API version the code pinned its client to. */
  apiVersion: '',
  /** The release listing fails, as a network or API error would. */
  releasesFail: false,
  /** Ids asked of the doc endpoint, in order. */
  docReads: [] as string[],
  /** Each doc-endpoint read with how many commits had landed before it. */
  readLog: [] as { id: string; commits: number }[],
  revs: 0,
  commits: 0,
  /** Transactions attempted, committed or not. */
  attempts: 0,
  /** Runs once, just before the next transaction commits. */
  beforeCommit: [] as (() => void)[],
  /** Runs once, just after the next transaction committed. */
  afterCommit: [] as (() => void)[],
  /** What GROQ sees when it lags the doc endpoint; null means no lag. */
  groqSnapshot: null as null | (Record<string, unknown> & { _id: string })[],
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      title: 'CND 2026',
      organization: { _ref: 'org-A' },
      endDate: '2026-06-11',
      domains: ['2026.example.no'],
    },
    error: null,
  }),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  const run = async (query: string, params: Record<string, unknown> = {}) => {
    // groq-js has no `releases::all()`; the store answers it.
    if (query.includes('releases::all()') && h.releasesFail)
      throw Object.assign(new Error('503 releases unavailable'), {
        statusCode: 503,
      })
    if (query.includes('releases::all()')) {
      // MEASURED on production (2026-10-19, no releases):
      // `releases::all(){ _id, state }` answers null, while
      // `releases::all()[]{ _id, state }` answers []. Modelled, so a query
      // that only works once a release exists fails here as it does there.
      if (h.releases.length === 0 && !query.includes('releases::all()[]'))
        return null
      return h.releases.map((r) => ({
        _id: `_.releases.${r.name}`,
        state: r.state,
      }))
    }
    const value = await evaluate(parse(query), {
      dataset: h.groqSnapshot ?? h.dataset,
      params,
    })
    return value.get()
  }
  const byId = (id: string) =>
    structuredClone(h.dataset.find((d) => d._id === id) ?? null)
  const pinned = {
    fetch: run,
    // The doc endpoint reads a comma-separated LIST of ids from its path and
    // answers sorted by `_id`; the client returns the first (verified
    // read-only against production). Modelled so a talkId with a comma reads
    // what Sanity would read.
    getDocument: async (id: string) => {
      h.docReads.push(id)
      h.readLog.push({ id, commits: h.commits })
      const found = id
        .split(',')
        .map(byId)
        .filter((d) => d !== null)
        .sort((a, b) => a._id.localeCompare(b._id))
      return found[0] ?? undefined
    },
    getDocuments: async (ids: string[]) => {
      h.docReads.push(...ids)
      return ids.map(byId)
    },
    transaction: () => {
      const tx = real.transaction()
      tx.commit = (async () => {
        h.attempts++
        h.beforeCommit.shift()?.()
        const out = await commit(tx.serialize())
        h.afterCommit.shift()?.()
        return out
      }) as unknown as typeof tx.commit
      return tx
    },
  }
  return {
    clientReadUncached: { fetch: run },
    clientWrite: {
      withConfig: (config: { apiVersion: string }) => {
        h.apiVersion = config.apiVersion
        return pinned
      },
    },
  }

  async function commit(mutations: unknown[]) {
    const { Mutation } = createRequire(
      createRequire(import.meta.url).resolve('sanity/package.json'),
    )('@sanity/mutator') as {
      Mutation: new (o: { mutations: unknown[] }) => {
        apply: (doc: Doc | null) => Doc | null
      }
    }
    // All or nothing, as a Sanity transaction is.
    const next = structuredClone(h.dataset)
    for (const m of mutations as Record<string, Record<string, unknown>>[]) {
      if (!m.patch)
        throw Object.assign(new Error('unexpected mutation'), {
          statusCode: 400,
        })
      const i = next.findIndex((d) => d._id === m.patch.id)
      // Sanity answers a patch of a missing document with 404 and rolls the
      // transaction back (measured on a development dataset).
      if (i < 0)
        throw Object.assign(
          new Error(`The document with the ID "${m.patch.id}" was not found`),
          { statusCode: 404 },
        )
      // Below 2025-02-19 the API does not handle `versions.**` (spec §4.2);
      // MODELLED as a refused write, like `versionedSanityStore`.
      if (
        String(m.patch.id).startsWith('versions.') &&
        h.apiVersion < '2025-02-19'
      )
        throw Object.assign(new Error(`${m.patch.id}: unknown API version`), {
          statusCode: 400,
        })
      // A version in a release that is not `active` is locked (Sanity's
      // documented rule; the status code is MODELLED).
      const release = /^versions\.([^.]+)\./.exec(String(m.patch.id))?.[1]
      if (
        release &&
        h.releases.find((r) => r.name === release)?.state !== 'active'
      )
        throw Object.assign(new Error(`${m.patch.id} is locked`), {
          statusCode: 409,
        })
      if (m.patch.ifRevisionID && m.patch.ifRevisionID !== next[i]._rev)
        throw Object.assign(new Error('Revision mismatch'), {
          statusCode: 409,
        })
      const doc = new Mutation({ mutations: [m] }).apply(next[i])!
      doc._rev = `rev-${++h.revs}`
      next[i] = doc
    }
    h.dataset = next
    h.commits++
    return { results: [] }
  }
})

import { initTRPC, TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import type { Context } from '@/server/trpc'
import { feedbackCodeIndexTag } from '@/lib/cache/tags'
import { sessionFeedbackRouter } from './sessionFeedback'

const t = initTRPC.context<Context>().create()
function caller(speakerId = 'sp-ada', isImpersonating = false) {
  const speaker = { _id: speakerId, name: 'Ada' }
  const user = { email: 'a@example.com', name: 'Ada', picture: '' }
  return t.createCallerFactory(sessionFeedbackRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: {
      expires: '2099-01-01T00:00:00Z',
      user,
      speaker,
      ...(isImpersonating && { isImpersonating: true }),
    },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const talk = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _rev: `rev-${id}`,
  _type: 'talk',
  title: id,
  status: 'confirmed',
  conference: ref('conf-A'),
  speakers: [ref('sp-ada'), ref('sp-bo')],
  ...fields,
})
const schedule = (talkId: string, date = '2026-06-10'): Doc => ({
  _id: `day-${talkId}-${date}`,
  _type: 'schedule',
  conference: ref('conf-A'),
  status: 'official',
  date,
  tracks: [
    {
      _key: 't',
      talks: [
        { _key: 's', talk: ref(talkId), startTime: '10:00', endTime: '10:40' },
      ],
    },
  ],
})
const doc = (id: string) => h.dataset.find((d) => d._id === id)
const CODE = /^[a-hjkmnp-z2-9]{6}$/

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
  vi.mocked(revalidateTag).mockClear()
  h.revs = 0
  h.commits = 0
  h.attempts = 0
  h.releases = []
  h.releasesFail = false
  h.docReads = []
  h.readLog = []
  h.beforeCommit = []
  h.afterCommit = []
  h.groqSnapshot = null
  h.dataset = [
    talk('talk-1'),
    schedule('talk-1'),
    talk('talk-foreign', { conference: ref('conf-B') }),
    talk('talk-other-speakers', { speakers: [ref('sp-bo')] }),
    talk('talk-accepted', { status: 'accepted' }),
    talk('talk-withdrawn', { status: 'withdrawn' }),
    { _id: 'sp-ada', _rev: 'rev-sp-ada', _type: 'speaker', name: 'Ada' },
    { _id: 'sp-bo', _rev: 'rev-sp-bo', _type: 'speaker', name: 'Bo' },
    {
      _id: 'sp-gone',
      _rev: 'rev-sp-gone',
      _type: 'speaker',
      erasedAt: '2026-05-01T00:00:00Z',
    },
    {
      _id: 'conf-A',
      _rev: 'rev-conf',
      _type: 'conference',
      speakers: [ref('sp-ada')],
      conference: ref('conf-A'),
      status: 'confirmed',
    },
  ]
})
afterEach(() => vi.useRealTimers())

describe('ensureCode — minting', () => {
  it('mints a code on the published talk and returns its URL on the talk’s domain', async () => {
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    expect(out.url).toBe(`https://2026.example.no/f/${out.code}`)
    expect(out.window).toMatchObject({
      state: 'before',
      opensAt: '2026-06-10T08:00:00.000Z',
    })
    expect(doc('talk-1')?.feedbackCode).toBe(out.code)
    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith(feedbackCodeIndexTag('conf-A'), {
      expire: 0,
    })
  })

  it('returns the same code again without a write or a cache flush', async () => {
    const first = await caller().ensureCode({ talkId: 'talk-1' })
    vi.mocked(revalidateTag).mockClear()
    const commits = h.commits
    const second = await caller('sp-bo').ensureCode({ talkId: 'talk-1' })
    expect(second.code).toBe(first.code)
    expect(h.commits).toBe(commits)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('mints for an unscheduled talk before the conference is over', async () => {
    h.dataset = h.dataset.filter((d) => d._type !== 'schedule')
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    expect(out.window.state).toBe('unscheduled')
  })

  it('writes the code to the draft and release versions too', async () => {
    h.dataset.push(
      talk('drafts.talk-1', { title: 'edited' }),
      talk('versions.r1.talk-1'),
    )
    h.releases = [{ name: 'r1', state: 'active' }]
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(doc('drafts.talk-1')?.feedbackCode).toBe(out.code)
    expect(doc('drafts.talk-1')?.title).toBe('edited')
    expect(doc('versions.r1.talk-1')?.feedbackCode).toBe(out.code)
  })
})

describe('ensureCode — no code once the window has closed', () => {
  it('mints nothing for a talk whose window has closed', async () => {
    vi.setSystemTime(new Date('2026-06-11T08:40:00Z'))
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out).toMatchObject({ code: null, url: null })
    expect(out.window.state).toBe('closed')
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
    expect(h.commits).toBe(0)
  })

  it('mints nothing for an unscheduled talk once the conference is over', async () => {
    h.dataset = h.dataset.filter((d) => d._type !== 'schedule')
    vi.setSystemTime(new Date('2026-06-12T00:00:00Z'))
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toBeNull()
    expect(h.commits).toBe(0)
  })

  it('still mints in the last hours of a window that is open', async () => {
    vi.setSystemTime(new Date('2026-06-11T08:39:00Z'))
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
  })

  it('returns an existing code after its window closed, with the closed state', async () => {
    h.dataset[0] = talk('talk-1', { feedbackCode: 'abcdef' })
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toBe('abcdef')
    expect(out.window.state).toBe('closed')
  })
})

describe('ensureCode — one uniform refusal, and nothing written', () => {
  const refusal = async (talkId: string, speakerId?: string) => {
    const error = await caller(speakerId)
      .ensureCode({ talkId })
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(error).toBeInstanceOf(TRPCError)
    const { code, message } = error as TRPCError
    return { code, message }
  }

  it.each([
    ['another conference’s talk', 'talk-foreign', undefined],
    ['a talk the caller does not speak at', 'talk-other-speakers', undefined],
    ['an accepted but unconfirmed talk', 'talk-accepted', undefined],
    ['a withdrawn talk', 'talk-withdrawn', undefined],
    ['a talk id that does not exist', 'talk-nope', undefined],
    ['a document that is not a talk', 'conf-A', undefined],
    ['a draft id', 'drafts.talk-1', undefined],
  ])('refuses %s exactly like a missing talk', async (_, talkId, speakerId) => {
    h.dataset.push(talk('drafts.talk-1'))
    const unknown = await refusal('talk-nope')
    expect(await refusal(talkId, speakerId)).toEqual(unknown)
    expect(unknown.code).toBe('NOT_FOUND')
    expect(h.commits).toBe(0)
    expect(revalidateTag).not.toHaveBeenCalled()
    for (const d of h.dataset) expect(d.feedbackCode).toBeUndefined()
  })
})

describe('ensureCode — the talk id is an id, nothing else', () => {
  it.each([
    ['a comma list of ids', 'talk-1,talk-foreign'],
    ['a path escape to the query endpoint', '../../query/test?query=*'],
    ['a query string', 'talk-1?excludeContent=true'],
    ['a slash', 'talk/1'],
    ['leading whitespace', ' talk-1'],
  ])('refuses %s before any read', async (_, talkId) => {
    await expect(caller().ensureCode({ talkId })).rejects.toBeInstanceOf(
      TRPCError,
    )
    expect(h.docReads).toEqual([])
    expect(h.commits).toBe(0)
  })

  it('refuses a talk read that is not the id asked for (the comma list Sanity accepts)', async () => {
    // Below the router's id check: what the doc endpoint does with a list.
    const { ensureFeedbackCode } = await import('@/lib/feedback/server')
    const conference = { _id: 'conf-A', endDate: '2026-06-11' }
    for (const talkId of ['talk-1,zz-missing', 'talk-1,drafts.talk-1']) {
      h.dataset.push(talk('drafts.talk-1'))
      expect(
        await ensureFeedbackCode({
          talkId,
          actor: { speakerId: 'sp-ada' },
          conference,
          now: new Date(),
        }),
      ).toEqual({ status: 'refused' })
    }
    expect(h.commits).toBe(0)
  })
})

describe('ensureCode — impersonation', () => {
  it('refuses while an organizer impersonates a speaker, before any read', async () => {
    await expect(
      caller('sp-ada', true).ensureCode({ talkId: 'talk-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.docReads).toEqual([])
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
  })
})

describe('ensureCode — concurrent writes', () => {
  it('retries when a draft is deleted between the read and the commit', async () => {
    h.dataset.push(talk('drafts.talk-1'))
    h.beforeCommit.push(() => {
      h.dataset = h.dataset.filter((d) => d._id !== 'drafts.talk-1')
    })
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    expect(doc('talk-1')?.feedbackCode).toBe(out.code)
    expect(h.attempts).toBe(2)
  })

  it('mints nothing while the release list does not load, then mints into the release version once it does', async () => {
    h.dataset.push(talk('drafts.talk-1'), talk('versions.r1.talk-1'))
    h.releases = [{ name: 'r1', state: 'active' }]
    h.releasesFail = true
    await expect(
      caller().ensureCode({ talkId: 'talk-1' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    expect(h.attempts).toBe(0)
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()

    h.releasesFail = false
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    expect(doc('talk-1')?.feedbackCode).toBe(out.code)
    expect(doc('drafts.talk-1')?.feedbackCode).toBe(out.code)
    expect(doc('versions.r1.talk-1')?.feedbackCode).toBe(out.code)
  })

  it('mints no code while a version waits in a scheduled release, and mints once the release is published', async () => {
    h.dataset.push(talk('versions.rlocked.talk-1'), talk('versions.r1.talk-1'))
    h.releases = [
      { name: 'rlocked', state: 'scheduled' },
      { name: 'r1', state: 'active' },
    ]
    // GROQ has not seen the scheduled version yet; it is read by id.
    h.groqSnapshot = h.dataset.filter(
      (d) => d._id !== 'versions.rlocked.talk-1',
    )
    const blocked = await caller().ensureCode({ talkId: 'talk-1' })
    expect(blocked).toMatchObject({ code: null, url: null })
    expect(blocked.window.state).toBe('before')
    expect(h.attempts).toBe(0)
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()

    // Publishing the release replaces the talk and removes the version.
    h.groqSnapshot = null
    h.dataset = h.dataset.filter((d) => d._id !== 'versions.rlocked.talk-1')
    h.releases[0].state = 'published'
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    expect(doc('talk-1')?.feedbackCode).toBe(out.code)
    expect(doc('versions.r1.talk-1')?.feedbackCode).toBe(out.code)
  })

  it('logs a version locked in a release while the write ran', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.releases = [{ name: 'rlocked', state: 'scheduled' }]
    h.afterCommit.push(() => {
      h.dataset.push(talk('versions.rlocked.talk-1'))
    })
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('a locked release holds a stale version'),
    )
    error.mockRestore()
  })

  it('converges on the code another request minted first', async () => {
    h.beforeCommit.push(() => {
      const i = h.dataset.findIndex((d) => d._id === 'talk-1')
      h.dataset[i] = { ...h.dataset[i], feedbackCode: 'zzzzzz', _rev: 'won' }
    })
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toBe('zzzzzz')
    expect(doc('talk-1')?.feedbackCode).toBe('zzzzzz')
    // The losing request minted nothing.
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('retries when a draft is edited during the write', async () => {
    h.dataset.push(talk('drafts.talk-1'))
    h.beforeCommit.push(() => {
      const i = h.dataset.findIndex((d) => d._id === 'drafts.talk-1')
      h.dataset[i] = { ...h.dataset[i], title: 'typing', _rev: 'edited' }
    })
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    expect(doc('talk-1')?.feedbackCode).toBe(out.code)
    expect(doc('drafts.talk-1')).toMatchObject({
      feedbackCode: out.code,
      title: 'typing',
    })
  })

  it('refuses when the talk is withdrawn during the write', async () => {
    h.beforeCommit.push(() => {
      const i = h.dataset.findIndex((d) => d._id === 'talk-1')
      h.dataset[i] = { ...h.dataset[i], status: 'withdrawn', _rev: 'gone' }
    })
    await expect(
      caller().ensureCode({ talkId: 'talk-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Talk not found' })
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
  })

  it('sweeps a draft created between the version lookup and the commit', async () => {
    h.beforeCommit.push(() => {
      h.dataset.push(talk('drafts.talk-1', { _rev: 'late' }))
    })
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(doc('drafts.talk-1')?.feedbackCode).toBe(out.code)
  })

  it('sweeps a draft holding a different code back to the published one', async () => {
    h.dataset.push(talk('drafts.talk-1', { feedbackCode: 'stale2' }))
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(doc('drafts.talk-1')?.feedbackCode).toBe(out.code)
  })

  it('takes version revisions from the doc endpoint, not lagging GROQ', async () => {
    h.dataset.push(talk('drafts.talk-1'))
    // A draft edit that GROQ has not caught up with yet.
    h.groqSnapshot = structuredClone(h.dataset)
    h.dataset.find((d) => d._id === 'drafts.talk-1')!._rev = 'edited'
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    expect(doc('drafts.talk-1')?.feedbackCode).toBe(out.code)
    expect(h.attempts).toBe(1)
  })

  it('finds a draft GROQ cannot see yet', async () => {
    h.groqSnapshot = structuredClone(h.dataset)
    h.dataset.push(talk('drafts.talk-1'))
    await caller().ensureCode({ talkId: 'talk-1' })
    expect(h.attempts).toBe(1)
    expect(doc('drafts.talk-1')?.feedbackCode).toMatch(CODE)
  })

  it('gives up after three retries and writes nothing', async () => {
    h.dataset.push(talk('drafts.talk-1'))
    for (let i = 0; i < 10; i++) {
      h.beforeCommit.push(() => {
        const d = h.dataset.find((x) => x._id === 'drafts.talk-1')!
        d._rev = `typing-${i}`
      })
    }
    await expect(
      caller().ensureCode({ talkId: 'talk-1' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    expect(h.attempts).toBe(4)
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('sweeps versions to the published code as it is after the commit', async () => {
    h.dataset.push(talk('drafts.talk-1', { feedbackCode: 'stale2' }))
    // Another write replaces the published code right after this mint.
    h.afterCommit.push(() => {
      const d = h.dataset.find((x) => x._id === 'talk-1')!
      d.feedbackCode = 'rotate'
      d._rev = 'rotated'
    })
    await caller().ensureCode({ talkId: 'talk-1' })
    expect(doc('drafts.talk-1')?.feedbackCode).toBe('rotate')
  })

  it('stops re-patching after three sweeps and logs it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.dataset.push(talk('drafts.talk-1'))
    // Someone keeps putting an old value back on the draft.
    for (let i = 0; i < 10; i++) {
      h.afterCommit.push(() => {
        const d = h.dataset.find((x) => x._id === 'drafts.talk-1')!
        d.feedbackCode = 'stale2'
        d._rev = `restaled-${i}`
      })
    }
    const out = await caller().ensureCode({ talkId: 'talk-1' })
    expect(out.code).toMatch(CODE)
    // The mint, then three sweep patches.
    expect(h.attempts).toBe(4)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('gave up sweeping stale versions of talk-1'),
    )
    error.mockRestore()
  })
})

describe('sessionFeedbackRouter surface', () => {
  it('exposes exactly the procedures this slice ships', () => {
    const { procedures } = (
      sessionFeedbackRouter as unknown as {
        _def: { procedures: Record<string, unknown> }
      }
    )._def
    expect(Object.keys(procedures).sort()).toEqual([
      'adminCode',
      'ensureCode',
      'mintAll',
      'mintCode',
      'mintPreview',
    ])
  })
})

/** An organizer of org-A (the request's org) who speaks at no talk. */
function organizer(orgIds: string[] = ['org-A']) {
  const speaker = { _id: 'sp-org', name: 'Org', organizerOrgIds: orgIds }
  const user = { email: 'o@example.com', name: 'Org', picture: '' }
  return t.createCallerFactory(sessionFeedbackRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

describe('mintCode — an organizer mints one talk’s code', () => {
  it('mints a code on a talk the organizer does not speak at', async () => {
    const out = await organizer().mintCode({ talkId: 'talk-other-speakers' })
    expect(out.code).toMatch(CODE)
    expect(out.url).toBe(`https://2026.example.no/f/${out.code}`)
    expect(doc('talk-other-speakers')?.feedbackCode).toBe(out.code)
    expect(revalidateTag).toHaveBeenCalledWith(feedbackCodeIndexTag('conf-A'), {
      expire: 0,
    })
  })
})

describe('mintCode — refusals, before any read', () => {
  it('refuses a speaker of the talk who is not an organizer', async () => {
    await expect(
      caller('sp-ada').mintCode({ talkId: 'talk-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.docReads).toEqual([])
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
  })

  it('refuses an organizer of another organization', async () => {
    await expect(
      organizer(['org-B']).mintCode({ talkId: 'talk-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.docReads).toEqual([])
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
  })
})

describe('mintCode — the same rules as the speaker’s mint', () => {
  it.each([
    ['another conference’s talk', 'talk-foreign'],
    ['an accepted talk', 'talk-accepted'],
    ['a withdrawn talk', 'talk-withdrawn'],
    ['a missing talk', 'talk-missing'],
  ])('refuses %s with NOT_FOUND and writes nothing', async (_, talkId) => {
    await expect(organizer().mintCode({ talkId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.attempts).toBe(0)
    expect(doc(talkId)?.feedbackCode).toBeUndefined()
  })

  it('keeps a code the talk already has', async () => {
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-1' ? { ...d, feedbackCode: 'k7m2qx' } : d,
    )
    const out = await organizer().mintCode({ talkId: 'talk-1' })
    expect(out.code).toBe('k7m2qx')
    expect(doc('talk-1')?.feedbackCode).toBe('k7m2qx')
    expect(h.attempts).toBe(0)
  })

  it('mints nothing once the talk’s window has closed', async () => {
    vi.setSystemTime(new Date('2026-06-11T08:40:00Z'))
    const out = await organizer().mintCode({ talkId: 'talk-1' })
    expect(out).toMatchObject({ code: null, url: null })
    expect(out.window.state).toBe('closed')
    expect(h.attempts).toBe(0)
  })

  it('mints nothing while a version waits in a scheduled release', async () => {
    h.dataset.push(talk('versions.r1.talk-1'))
    h.releases = [{ name: 'r1', state: 'scheduled' }]
    const out = await organizer().mintCode({ talkId: 'talk-1' })
    expect(out.code).toBeNull()
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
  })
})

describe('mintAll — every confirmed talk without a code', () => {
  beforeEach(() => {
    h.dataset.push(
      talk('talk-2'),
      schedule('talk-2'),
      talk('talk-3', { feedbackCode: 'k7m2qx' }),
      talk('drafts.talk-4'),
    )
  })

  it('mints a unique code for each, expires the index once, and reports each talk', async () => {
    const out = await organizer().mintAll()
    const codes = ['talk-1', 'talk-2', 'talk-other-speakers'].map(
      (id) => doc(id)?.feedbackCode,
    )
    for (const c of codes) expect(c).toMatch(CODE)
    expect(new Set([...codes, 'k7m2qx']).size).toBe(4)
    expect(out.minted.map((m) => m.talkId).sort()).toEqual([
      'talk-1',
      'talk-2',
      'talk-other-speakers',
    ])
    expect(out.alreadyHad).toBe(1)
    expect(out.skipped).toEqual([])
    expect(out.failed).toEqual([])
    // Not the foreign, unconfirmed or draft-only talks.
    for (const id of ['talk-foreign', 'talk-accepted', 'drafts.talk-4'])
      expect(doc(id)?.feedbackCode).toBeUndefined()
    expect(doc('talk-3')?.feedbackCode).toBe('k7m2qx')
    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith(feedbackCodeIndexTag('conf-A'), {
      expire: 0,
    })
  })

  it('never repeats a code it minted, though GROQ lags the batch’s writes', async () => {
    // GROQ sees none of the batch's codes, and the random source draws every
    // code twice in a row: only the batch's own memory keeps them apart.
    h.groqSnapshot = structuredClone(h.dataset)
    let calls = 0
    const random = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        const letter = Math.floor(Math.floor(calls++ / 6) / 2)
        ;(array as unknown as Uint32Array)[0] = Math.ceil(
          (letter * 2 ** 32) / 31,
        )
        return array
      })
    const out = await organizer().mintAll()
    random.mockRestore()
    const codes = out.minted.map((m) => m.code)
    // Talks mint in parallel, so which talk drew which code may vary.
    expect([...codes].sort()).toEqual(['aaaaaa', 'bbbbbb', 'cccccc'])
    expect(out.minted.map((m) => doc(m.talkId)?.feedbackCode)).toEqual(codes)
  })

  it('never repeats a code a talk already held but GROQ did not show', async () => {
    // talk-1 got 'aaaaaa' from its speaker a moment ago: the doc endpoint
    // has it, GROQ does not yet, and the random source draws it next.
    h.groqSnapshot = structuredClone(h.dataset)
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-1' ? { ...d, feedbackCode: 'aaaaaa' } : d,
    )
    let calls = 0
    const random = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        const letter = Math.floor(calls++ / 6)
        ;(array as unknown as Uint32Array)[0] = Math.ceil(
          (letter * 2 ** 32) / 31,
        )
        return array
      })
    const out = await organizer().mintAll()
    random.mockRestore()
    expect(doc('talk-1')?.feedbackCode).toBe('aaaaaa')
    expect(out.minted.map((m) => m.code)).not.toContain('aaaaaa')
  })

  it('never repeats a code held by a talk late in the queue that GROQ does not show', async () => {
    // Sixty more talks put talk-zz behind the first workers' draws, and in
    // the second chunk of the by-id read.
    h.dataset.push(
      ...Array.from({ length: 60 }, (_, i) =>
        talk(`talk-a${String(i).padStart(2, '0')}`),
      ),
      talk('talk-zz'),
    )
    h.groqSnapshot = structuredClone(h.dataset)
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-zz' ? { ...d, feedbackCode: 'aaaaaa' } : d,
    )
    let calls = 0
    const random = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        const letter = Math.floor(calls++ / 6)
        ;(array as unknown as Uint32Array)[0] = Math.ceil(
          (letter * 2 ** 32) / 31,
        )
        return array
      })
    const out = await organizer().mintAll()
    random.mockRestore()
    expect(doc('talk-zz')?.feedbackCode).toBe('aaaaaa')
    expect(out.minted.length).toBeGreaterThan(0)
    expect(out.minted.map((m) => m.code)).not.toContain('aaaaaa')
  })

  it('reports a talk whose write fails and still mints the rest', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The first talk's transaction fails, as a Sanity outage would.
    h.beforeCommit.push(() => {
      throw Object.assign(new Error('boom'), { statusCode: 500 })
    })
    const out = await organizer().mintAll()
    error.mockRestore()
    expect(out.failed).toEqual([{ talkId: 'talk-1', title: 'talk-1' }])
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
    expect(out.minted.map((m) => m.talkId)).toEqual([
      'talk-2',
      'talk-other-speakers',
    ])
    expect(doc('talk-2')?.feedbackCode).toMatch(CODE)
  })

  it('mints a code for a talk whose stored value is not a code', async () => {
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-3' ? { ...d, feedbackCode: 'not a code!' } : d,
    )
    const out = await organizer().mintAll()
    expect(out.minted.map((m) => m.talkId)).toContain('talk-3')
    expect(doc('talk-3')?.feedbackCode).toMatch(CODE)
    expect(await organizer().mintPreview()).toEqual({
      confirmed: 4,
      withoutCode: 0,
      mintable: 0,
    })
  })

  it('mints nothing the second time, and expires the index once', async () => {
    await organizer().mintAll()
    const commits = h.commits
    vi.mocked(revalidateTag).mockClear()
    const again = await organizer().mintAll()
    expect(again.minted).toEqual([])
    expect(again.alreadyHad).toBe(4)
    expect(h.commits).toBe(commits)
    // A run cut off before its own expiry is recovered by the next run.
    expect(revalidateTag).toHaveBeenCalledTimes(1)
  })

  it('skips a talk whose window closed and one waiting on a scheduled release', async () => {
    // talk-2's slot ended; talk-1 holds a version in a scheduled release.
    h.dataset = h.dataset.map((d) =>
      d._id === 'day-talk-2-2026-06-10' ? schedule('talk-2', '2026-05-01') : d,
    )
    h.dataset.push(talk('versions.r1.talk-1'))
    h.releases = [{ name: 'r1', state: 'scheduled' }]
    // The count does not look at releases: the locked talk-1 is counted as
    // mintable, and only the mint finds it waits.
    expect(await organizer().mintPreview()).toEqual({
      confirmed: 4,
      withoutCode: 3,
      mintable: 2,
    })
    const out = await organizer().mintAll()
    expect(out.skipped).toEqual([
      { talkId: 'talk-1', title: 'talk-1', reason: 'release' },
      { talkId: 'talk-2', title: 'talk-2', reason: 'closed' },
    ])
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
    expect(doc('talk-2')?.feedbackCode).toBeUndefined()
    expect(out.minted.map((m) => m.talkId)).toEqual(['talk-other-speakers'])
  })

  it('counts the confirmed talks without a code for the confirmation', async () => {
    expect(await organizer().mintPreview()).toEqual({
      confirmed: 4,
      withoutCode: 3,
      mintable: 3,
    })
  })

  it('does not count a talk whose window has closed as mintable', async () => {
    h.dataset = h.dataset.map((d) =>
      d._id === 'day-talk-2-2026-06-10' ? schedule('talk-2', '2026-05-01') : d,
    )
    expect(await organizer().mintPreview()).toEqual({
      confirmed: 4,
      withoutCode: 3,
      mintable: 2,
    })
    // Once the conference is over, no talk can get one.
    vi.setSystemTime(new Date('2026-06-12T00:00:00Z'))
    expect(await organizer().mintPreview()).toMatchObject({ mintable: 0 })
  })

  it.each([
    ['a speaker who is not an organizer', () => caller('sp-ada')],
    ['an organizer of another organization', () => organizer(['org-B'])],
  ])('refuses %s, before any read', async (_, who) => {
    await expect(who().mintAll()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(who().mintPreview()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(h.docReads).toEqual([])
    expect(h.attempts).toBe(0)
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
  })
})

describe('adminCode — what the talk page shows, never a write', () => {
  it('offers a mint for a talk with no code, and writes nothing', async () => {
    const out = await organizer().adminCode({ talkId: 'talk-1' })
    expect(out).toMatchObject({ code: null, url: null, mayMint: true })
    expect(out.window.state).toBe('before')
    expect(h.attempts).toBe(0)
    expect(doc('talk-1')?.feedbackCode).toBeUndefined()
  })

  it('returns the talk’s code and URL once it has one', async () => {
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-1' ? { ...d, feedbackCode: 'k7m2qx' } : d,
    )
    expect(await organizer().adminCode({ talkId: 'talk-1' })).toMatchObject({
      code: 'k7m2qx',
      url: 'https://2026.example.no/f/k7m2qx',
      mayMint: false,
    })
  })

  it('offers no mint once the window has closed', async () => {
    vi.setSystemTime(new Date('2026-06-11T08:40:00Z'))
    const out = await organizer().adminCode({ talkId: 'talk-1' })
    expect(out).toMatchObject({ code: null, mayMint: false })
  })

  it('answers another conference’s talk like a missing one', async () => {
    for (const talkId of ['talk-foreign', 'talk-missing', 'talk-accepted'])
      await expect(organizer().adminCode({ talkId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
  })

  it('refuses a speaker who is not an organizer, before any read', async () => {
    await expect(
      caller('sp-ada').adminCode({ talkId: 'talk-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.docReads).toEqual([])
  })
})

describe('organizers never restart feedback for an erased speaker', () => {
  // Erasure unsets the code of a talk whose only speaker it erased (spec
  // §12.3); an organizer's mint must not bring it back (§10.4's rule).
  beforeEach(() => {
    h.dataset.push(
      talk('talk-erased', { speakers: [ref('sp-gone')] }),
      talk('talk-co-spoken', { speakers: [ref('sp-gone'), ref('sp-bo')] }),
      talk('talk-speaker-deleted', { speakers: [ref('sp-deleted')] }),
    )
  })

  it.each(['talk-erased', 'talk-speaker-deleted'])(
    'refuses to mint %s, and writes nothing',
    async (talkId) => {
      await expect(organizer().mintCode({ talkId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      expect(h.attempts).toBe(0)
      expect(doc(talkId)?.feedbackCode).toBeUndefined()
    },
  )

  it('mints for a talk one of whose speakers remains', async () => {
    const out = await organizer().mintCode({ talkId: 'talk-co-spoken' })
    expect(out.code).toMatch(CODE)
  })

  it('reports the erased speaker’s talk as skipped, and leaves it out of the count', async () => {
    expect(await organizer().mintPreview()).toEqual({
      confirmed: 5,
      withoutCode: 5,
      mintable: 3,
    })
    const out = await organizer().mintAll()
    expect(doc('talk-erased')?.feedbackCode).toBeUndefined()
    expect(doc('talk-speaker-deleted')?.feedbackCode).toBeUndefined()
    expect(doc('talk-co-spoken')?.feedbackCode).toMatch(CODE)
    expect(out.skipped).toEqual([
      { talkId: 'talk-erased', title: 'talk-erased', reason: 'noSpeaker' },
      {
        talkId: 'talk-speaker-deleted',
        title: 'talk-speaker-deleted',
        reason: 'noSpeaker',
      },
    ])
    // The speaker's documents are read by id too, before any write.
    expect(h.attempts).toBe(3)
  })

  it('refuses an erased speaker’s talk even when GROQ still lists it', async () => {
    // GROQ lags the erasure: it still sees the speaker as not erased.
    h.groqSnapshot = structuredClone(h.dataset).map((d) =>
      d._id === 'sp-gone' ? { ...d, erasedAt: undefined } : d,
    )
    const out = await organizer().mintAll()
    expect(doc('talk-erased')?.feedbackCode).toBeUndefined()
    expect(out.skipped).toContainEqual({
      talkId: 'talk-erased',
      title: 'talk-erased',
      reason: 'changed',
    })
  })
})

describe('organizer mint — races', () => {
  it('re-checks for a speaker left when a write is retried', async () => {
    h.dataset.push(
      talk('talk-co-spoken', { speakers: [ref('sp-gone'), ref('sp-bo')] }),
    )
    // The live co-speaker is removed while the mint writes: its guard fails.
    h.beforeCommit.push(() => {
      h.dataset = h.dataset.map((d) =>
        d._id === 'talk-co-spoken'
          ? { ...d, speakers: [ref('sp-gone')], _rev: 'rev-removed' }
          : d,
      )
    })
    await expect(
      organizer().mintCode({ talkId: 'talk-co-spoken' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(doc('talk-co-spoken')?.feedbackCode).toBeUndefined()
    expect(h.commits).toBe(0)
  })
})

describe('mintAll — within the function’s time limit', () => {
  const extra = Array.from({ length: 8 }, (_, i) => `talk-x${i}`)
  beforeEach(() => {
    h.dataset.push(...extra.map((id) => talk(id)))
  })

  it('works on several talks at once', async () => {
    await organizer().mintAll()
    // The first reads of the first four talks come before any commit.
    const firstReads = h.readLog.filter(
      (r) => r.id.startsWith('talk-') && r.commits === 0,
    )
    expect(new Set(firstReads.map((r) => r.id)).size).toBeGreaterThanOrEqual(4)
  })

  it('leaves talks it could not start in time for the next run', async () => {
    // The clock jumps past the budget once the first commit lands.
    h.beforeCommit.push(() => vi.setSystemTime(new Date(Date.now() + 60_000)))
    const out = await organizer().mintAll()
    const notReached = out.skipped.filter((t) => t.reason === 'notReached')
    expect(notReached.length).toBeGreaterThan(0)
    for (const t of notReached)
      expect(doc(t.talkId)?.feedbackCode).toBeUndefined()
    expect(out.minted.length + notReached.length).toBe(extra.length + 2)
    const again = await organizer().mintAll()
    expect(again.minted.map((m) => m.talkId).sort()).toEqual(
      notReached.map((t) => t.talkId).sort(),
    )
  })
})

describe('mintAll — nothing to mint, nothing to expire', () => {
  it('leaves the index alone when no talk has a code', async () => {
    vi.setSystemTime(new Date('2026-06-12T00:00:00Z'))
    const out = await organizer().mintAll()
    expect(out.minted).toEqual([])
    expect(out.alreadyHad).toBe(0)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('mintAll — each talk judged when it starts', () => {
  it('mints nothing for a talk whose window closed while the run was going', async () => {
    const late = Array.from({ length: 8 }, (_, i) => `talk-late${i}`)
    h.dataset.push(...late.flatMap((id) => [talk(id), schedule(id)]))
    // Ten seconds before the windows close (2026-06-11 08:40Z); the first
    // commit lands after they have.
    vi.setSystemTime(new Date('2026-06-11T08:39:50Z'))
    h.beforeCommit.push(() =>
      // 15 s on: past the windows, within the run's 30 s start budget.
      vi.setSystemTime(new Date('2026-06-11T08:40:05Z')),
    )
    const out = await organizer().mintAll()
    const closed = out.skipped.filter((t) => t.reason === 'closed')
    expect(closed.length).toBeGreaterThan(0)
    for (const t of closed) expect(doc(t.talkId)?.feedbackCode).toBeUndefined()
  })
})
