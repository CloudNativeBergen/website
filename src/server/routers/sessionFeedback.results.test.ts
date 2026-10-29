/**
 * @vitest-environment node
 *
 * `sessionFeedback.results` (speaker feedback spec §4.3, §9.1, §9.3) through
 * the tRPC caller. Every GROQ read is EXECUTED with groq-js against an
 * in-memory dataset; only the network is replaced. Each query is logged, so a
 * refusal can be shown to happen before any response is read.
 */
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

type Doc = Record<string, unknown> & { _id: string }

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  queries: [] as string[],
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

vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params: Record<string, unknown> = {}) => {
    h.queries.push(query)
    const value = await evaluate(parse(query), { dataset: h.dataset, params })
    return value.get()
  }
  const refuse = () => {
    throw new Error('results must not write or use the doc endpoint')
  }
  return {
    clientReadUncached: { fetch },
    clientReadCached: { fetch },
    clientWrite: { withConfig: refuse, fetch: refuse },
  }
})

import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { sessionFeedbackRouter } from './sessionFeedback'

const t = initTRPC.context<Context>().create()
function caller(speakerId = 'sp-ada') {
  const speaker = { _id: speakerId, name: 'Ada' }
  const user = { email: 'a@example.com', name: 'Ada', picture: '' }
  return t.createCallerFactory(sessionFeedbackRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const talk = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _type: 'talk',
  title: id,
  status: 'confirmed',
  conference: ref('conf-A'),
  speakers: [ref('sp-ada'), ref('sp-bo')],
  ...fields,
})
/** One slot on 2026-06-10, 10:00–10:40 Oslo (08:00–08:40Z). */
const schedule = (talkId: string, fields: Record<string, unknown> = {}) => ({
  _id: `day-${talkId}`,
  _type: 'schedule',
  conference: ref('conf-A'),
  status: 'official',
  date: '2026-06-10',
  tracks: [
    {
      _key: 't',
      talks: [
        { _key: 's', talk: ref(talkId), startTime: '10:00', endTime: '10:40' },
      ],
    },
  ],
  ...fields,
})
let n = 0
const response = (
  talkId: string,
  colour: string,
  fields: Record<string, unknown> = {},
): Doc => ({
  _id: `feedbackResponse-${String(++n).padStart(32, '0')}`,
  _type: 'feedbackResponse',
  talk: ref(talkId),
  conference: ref('conf-A'),
  colour,
  submittedAt: `2026-06-10T08:${String(10 + n).padStart(2, '0')}:00.000Z`,
  ...fields,
})

/** After the slot ended, inside the window (closes 2026-06-11T08:40Z). */
const AFTER_SESSION = new Date('2026-06-10T09:00:00Z')
/** During the session: the window is open, but speakers can't see yet. */
const IN_SESSION = new Date('2026-06-10T08:20:00Z')

const readResponses = () =>
  h.queries.some((q) => q.includes('"feedbackResponse"'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AFTER_SESSION)
  n = 0
  h.queries = []
  h.dataset = [
    talk('talk-1', {
      audienceFeedback: { greenCount: 4, yellowCount: 1, redCount: 0 },
    }),
    schedule('talk-1'),
    talk('talk-foreign', { conference: ref('conf-B') }),
    talk('talk-other-speakers', { speakers: [ref('sp-bo')] }),
    talk('talk-accepted', { status: 'accepted' }),
    talk('talk-withdrawn', { status: 'withdrawn' }),
    talk('drafts.talk-draft-only'),
    talk('talk-unscheduled'),
  ]
})
afterEach(() => vi.useRealTimers())

describe('results — who may read them (§9.1)', () => {
  const refusals: [string, string, string?][] = [
    ['a missing talk', 'talk-nope'],
    ['another conference’s talk', 'talk-foreign'],
    ['a talk the caller does not speak at', 'talk-other-speakers'],
    ['an accepted, unconfirmed talk', 'talk-accepted'],
    ['a withdrawn talk', 'talk-withdrawn'],
    ['a talk that exists only as a draft', 'talk-draft-only'],
    ['a draft id', 'drafts.talk-draft-only'],
  ]

  it.each(refusals)(
    'refuses %s with the same NOT_FOUND, before reading any response',
    async (_, talkId) => {
      // Responses exist for every one of them, so a read would find some.
      h.dataset.push(
        response(talkId, 'green', { comment: 'secret' }),
        schedule(talkId, { _id: `day-${talkId}` }),
      )
      const error = await caller()
        .results({ talkId })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(TRPCError)
      expect(error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Talk not found',
      })
      expect(readResponses()).toBe(false)
    },
  )

  it('answers a co-speaker of the talk too', async () => {
    const out = await caller('sp-bo').results({ talkId: 'talk-1' })
    expect(out.visible).toBe(true)
  })
})

describe('results — when they are visible (§6, §9.3)', () => {
  it('stays hidden while the session runs, without reading a response', async () => {
    vi.setSystemTime(IN_SESSION)
    h.dataset.push(response('talk-1', 'green', { comment: 'early' }))
    const out = await caller().results({ talkId: 'talk-1' })
    expect(out).toEqual({
      visible: false,
      window: expect.objectContaining({
        state: 'open',
        feedbackVisible: false,
      }),
    })
    expect(readResponses()).toBe(false)
  })

  it('shows them once the last slot ended, with the window still open', async () => {
    const out = await caller().results({ talkId: 'talk-1' })
    expect(out.visible).toBe(true)
    expect(out.window.state).toBe('open')
  })

  it('shows them for an unscheduled talk once the conference is over', async () => {
    vi.setSystemTime(new Date('2026-06-12T12:00:00Z'))
    h.dataset.push(response('talk-unscheduled', 'red'))
    const out = await caller().results({ talkId: 'talk-unscheduled' })
    expect(out.visible && out.totals.combined).toEqual({
      green: 0,
      yellow: 0,
      red: 1,
    })
  })

  it('stays hidden for an unscheduled talk before the conference is over', async () => {
    const out = await caller().results({ talkId: 'talk-unscheduled' })
    expect(out.visible).toBe(false)
  })

  it('ignores a draft schedule that would place the talk earlier', async () => {
    h.dataset = h.dataset.filter((d) => d._type !== 'schedule')
    h.dataset.push(schedule('talk-1', { status: 'draft' }))
    const out = await caller().results({ talkId: 'talk-1' })
    // No official slot and the conference is not over: nothing to show yet.
    expect(out.visible).toBe(false)
  })
})

describe('results — what they hold (§4.3, §9.3)', () => {
  it('adds this talk’s responses, its fold and its Card Counts, and no one else’s', async () => {
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-1'
        ? {
            ...d,
            feedbackFolded: { greenCount: 2, yellowCount: 0, redCount: 1 },
          }
        : d,
    )
    h.dataset.push(
      response('talk-1', 'green'),
      response('talk-1', 'green'),
      response('talk-1', 'yellow'),
      response('talk-1', 'red', { hiddenAt: '2026-06-10T09:00:00Z' }),
      // Not this talk's, or not this conference's: never counted.
      response('talk-other-speakers', 'red'),
      response('talk-1', 'red', { conference: ref('conf-B') }),
      // A draft is never a response (§4.4).
      { ...response('talk-1', 'green'), _id: 'drafts.feedbackResponse-x' },
    )
    const out = await caller().results({ talkId: 'talk-1' })
    if (!out.visible) throw new Error('expected visible results')
    expect(out.totals.scanned).toEqual({ green: 4, yellow: 1, red: 2 })
    expect(out.totals.cards).toEqual({ green: 4, yellow: 1, red: 0 })
    expect(out.totals.combined).toEqual({ green: 8, yellow: 2, red: 2 })
    expect(out.totals.lovedItPercent).toBe(67)
  })

  it('lists visible comments oldest first, without hidden ones or their fields', async () => {
    const newer = response('talk-1', 'red', {
      comment: 'Too fast',
      submittedAt: '2026-06-10T08:50:00.000Z',
      flaggedAt: '2026-06-10T08:58:00.000Z',
    })
    const older = response('talk-1', 'green', {
      comment: 'Great demo',
      // Speakers get the minute, not the second: exact times in a small
      // room hint at who wrote what (§15).
      submittedAt: '2026-06-10T08:41:37.123Z',
    })
    h.dataset.push(
      newer,
      older,
      response('talk-1', 'yellow', {
        comment: 'Hidden by an organizer',
        hiddenAt: '2026-06-10T08:55:00Z',
      }),
      response('talk-1', 'green'),
      response('talk-other-speakers', 'green', { comment: 'other talk' }),
    )
    const out = await caller().results({ talkId: 'talk-1' })
    if (!out.visible) throw new Error('expected visible results')
    expect(out.comments).toEqual([
      {
        id: older._id,
        colour: 'green',
        comment: 'Great demo',
        submittedAt: '2026-06-10T08:41:00.000Z',
        flagged: false,
      },
      {
        id: newer._id,
        colour: 'red',
        comment: 'Too fast',
        submittedAt: '2026-06-10T08:50:00.000Z',
        // A speaker flagged it: every speaker of the talk sees that (§10.3).
        flagged: true,
      },
    ])
    // The hidden comment's colour still counts.
    expect(out.totals.scanned).toEqual({ green: 2, yellow: 1, red: 1 })
  })
})
