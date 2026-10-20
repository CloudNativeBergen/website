/**
 * @vitest-environment node
 *
 * The organizers' Session Feedback procedures (speaker feedback spec §10.1,
 * §10.3) through the tRPC caller. GROQ is EXECUTED with groq-js against an
 * in-memory dataset, and writes go through a REAL `@sanity/client`
 * transaction applied with `@sanity/mutator`; only the network is replaced.
 * Every query and commit is logged, so a refusal can be shown to come before
 * any read or write.
 */
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

type Doc = Record<string, unknown> & { _id: string }

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  queries: [] as string[],
  commits: [] as unknown[][],
  /** Fail the nth commit (1-based) from now; 0 never. */
  failCommit: 0,
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
    if (h.failCommit > 0 && --h.failCommit === 0)
      throw Object.assign(new Error('503'), { statusCode: 503 })
    const next = structuredClone(h.dataset)
    for (const m of mutations) {
      const id = String((m.patch ?? m.delete)?.id)
      const i = next.findIndex((d) => d._id === id)
      if (m.delete) {
        if (i >= 0) next.splice(i, 1)
        continue
      }
      if (!m.patch || i < 0)
        throw Object.assign(new Error(`${id} not found`), { statusCode: 404 })
      next[i] = new Mutation({ mutations: [m] }).apply(next[i])!
    }
    h.dataset = next
    h.commits.push(mutations)
    return { results: [] }
  }
  const refuse = () => {
    throw new Error('the admin procedures must not use the doc endpoint')
  }
  return {
    clientReadUncached: { fetch, getDocument: refuse },
    clientReadCached: { fetch },
    clientWrite: {
      fetch,
      getDocument: refuse,
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

import { initTRPC } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import type { Context } from '@/server/trpc'
import { feedbackResponseTag } from '@/lib/cache/tags'
import { sessionFeedbackRouter } from './sessionFeedback'

const t = initTRPC.context<Context>().create()
/** A signed-in speaker; an organizer of `orgIds` when given. */
function caller(orgIds?: string[]) {
  const speaker = {
    _id: 'sp-org',
    name: 'Org',
    ...(orgIds && { organizerOrgIds: orgIds }),
  }
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
const organizer = () => caller(['org-A'])

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const talk = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _type: 'talk',
  title: id,
  status: 'confirmed',
  conference: ref('conf-A'),
  speakers: [ref('sp-ada')],
  ...fields,
})
let n = 0
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
  comment: `comment ${n}`,
  submittedAt: `2026-06-10T10:${String(n).padStart(2, '0')}:00Z`,
  ...fields,
})
const doc = (id: string) => h.dataset.find((d) => d._id === id)
/**
 * The refusal, by its message: a missing procedure answers NOT_FOUND too, so
 * the code alone would pass with nothing built.
 */
const REFUSED = { code: 'NOT_FOUND', message: 'Feedback Response not found' }

let ours: Doc
let foreign: Doc
beforeEach(() => {
  n = 0
  h.queries = []
  h.commits = []
  h.failCommit = 0
  vi.mocked(revalidateTag).mockClear()
  ours = response('talk-a', 'red', { flaggedAt: '2026-06-10T11:00:00Z' })
  foreign = response('talk-foreign', 'red', { conference: ref('conf-B') })
  h.dataset = [
    talk('talk-a', { title: 'Kubernetes the hard way' }),
    talk('talk-foreign', { conference: ref('conf-B') }),
    ours,
    foreign,
  ]
})

describe('adminOverview', () => {
  it('gives an organizer this conference’s sessions and stats', async () => {
    const out = await organizer().adminOverview()
    expect(out.sessions.map((s) => s.talkId)).toEqual(['talk-a'])
    expect(out.sessions[0].comments).toEqual([
      expect.objectContaining({ id: ours._id, flagged: true }),
    ])
    expect(out.totals.total).toBe(1)
    expect(out.flagged).toBe(1)
  })
})

describe('adminHide, adminUnhide, adminRemove', () => {
  it('Hide hides, Unhide unhides, on this conference’s response', async () => {
    await expect(
      organizer().adminHide({ responseIds: [ours._id] }),
    ).resolves.toEqual({ count: 1 })
    expect(doc(ours._id)?.hiddenAt).toEqual(expect.any(String))
    expect(doc(ours._id)).not.toHaveProperty('flaggedAt')
    await organizer().adminUnhide({ responseIds: [ours._id] })
    expect(doc(ours._id)).not.toHaveProperty('hiddenAt')
  })

  it('Remove deletes it and expires its tag at once', async () => {
    await expect(
      organizer().adminRemove({ responseIds: [ours._id] }),
    ).resolves.toEqual({ removed: 1 })
    expect(doc(ours._id)).toBeUndefined()
    expect(revalidateTag).toHaveBeenCalledWith(feedbackResponseTag(ours._id), {
      expire: 0,
    })
  })

  it('acts on the conference serving the request, whatever the input says', async () => {
    await expect(
      organizer().adminRemove({
        responseIds: [foreign._id],
        conferenceId: 'conf-B',
      } as { responseIds: string[] }),
    ).rejects.toMatchObject(REFUSED)
    expect(doc(foreign._id)).toBeDefined()
    expect(h.commits).toEqual([])
  })
})

const ACTIONS = ['adminHide', 'adminUnhide', 'adminRemove'] as const

describe('adminRemove — a chunk that fails', () => {
  it('says how many went and to reload, not to try again (a retry is refused)', async () => {
    const ids = [ours._id]
    for (let i = 0; i < 120; i++) {
      const r = response('talk-a', 'green')
      h.dataset.push(r)
      ids.push(r._id)
    }
    h.failCommit = 2
    await expect(
      organizer().adminRemove({ responseIds: ids }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'Removed 100 of 121 responses. Reload to see what’s left, then remove those.',
    })
  })
})

describe('refusals', () => {
  it.each(ACTIONS)(
    '%s answers another conference’s response exactly as a missing one, writing nothing',
    async (action) => {
      const before = structuredClone(h.dataset)
      const a = await organizer()
        [action]({ responseIds: [foreign._id] })
        .catch((e: unknown) => e)
      const b = await organizer()
        [action]({ responseIds: [rid(4242)] })
        .catch((e: unknown) => e)
      expect(a).toMatchObject(REFUSED)
      expect(b).toMatchObject(REFUSED)
      expect(h.commits).toEqual([])
      expect(h.dataset).toEqual(before)
      expect(revalidateTag).not.toHaveBeenCalled()
    },
  )

  it.each(ACTIONS)(
    '%s refuses a mix of ours and another conference’s, writing nothing',
    async (action) => {
      const before = structuredClone(h.dataset)
      await expect(
        organizer()[action]({ responseIds: [ours._id, foreign._id] }),
      ).rejects.toMatchObject(REFUSED)
      expect(h.commits).toEqual([])
      expect(h.dataset).toEqual(before)
    },
  )

  it.each(ACTIONS)(
    '%s refuses a speaker who is not an organizer, before any read',
    async (action) => {
      await expect(
        caller()[action]({ responseIds: [ours._id] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(
        caller(['org-B'])[action]({ responseIds: [ours._id] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(h.queries).toEqual([])
      expect(h.commits).toEqual([])
      expect(doc(ours._id)).toEqual(ours)
    },
  )

  it('adminOverview refuses a speaker who is not an organizer, before any read', async () => {
    await expect(caller().adminOverview()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(h.queries).toEqual([])
  })

  it.each([
    ['a comma-joined list', `${rid(1)},${rid(2)}`],
    ['another document type', 'talk-a'],
    ['a draft id', `drafts.${rid(1)}`],
    ['an empty list', null],
  ])('refuses %s as input, before any read', async (_, id) => {
    await expect(
      organizer().adminRemove({ responseIds: id === null ? [] : [id] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.queries).toEqual([])
    expect(h.commits).toEqual([])
  })
})
