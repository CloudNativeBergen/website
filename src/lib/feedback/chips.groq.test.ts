/**
 * @vitest-environment node
 *
 * The dashboard chip per confirmed talk (speaker feedback spec §9.4), on
 * GROQ EXECUTED with groq-js against an in-memory dataset. Each query is
 * logged, so the test can show what is NOT read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  queries: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params: Record<string, unknown> = {}) => {
    h.queries.push(query)
    return (await evaluate(parse(query), { dataset: h.dataset, params })).get()
  }
  return {
    clientReadUncached: { fetch },
    clientReadCached: { fetch },
    clientWrite: {},
  }
})

import { getSpeakerFeedbackChips } from './chips'

type Doc = Record<string, unknown> & { _id: string }
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const talk = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _type: 'talk',
  status: 'confirmed',
  conference: ref('conf-A'),
  speakers: [ref('sp-ada')],
  ...fields,
})
let n = 0
const response = (talkId: string, colour: string, conf = 'conf-A'): Doc => ({
  _id: `feedbackResponse-${++n}`,
  _type: 'feedbackResponse',
  talk: ref(talkId),
  conference: ref(conf),
  colour,
})
/** talk-early 09:00–09:40 Oslo, talk-late 15:00–15:40 Oslo, on 2026-06-10. */
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
          talk: ref('talk-early'),
          startTime: '09:00',
          endTime: '09:40',
        },
        {
          _key: 'b',
          talk: ref('talk-late'),
          startTime: '15:00',
          endTime: '15:40',
        },
      ],
    },
  ],
}
const CONFERENCE = { _id: 'conf-A', endDate: '2026-06-11' }
/** Between the two sessions: talk-early has ended, talk-late has not. */
const MIDDAY = new Date('2026-06-10T10:00:00Z')

const chips = (now = MIDDAY, conference = CONFERENCE) =>
  getSpeakerFeedbackChips({ conference, speakerId: 'sp-ada', now })

beforeEach(() => {
  n = 0
  h.queries = []
  h.dataset = [
    SCHEDULE,
    talk('talk-early', {
      audienceFeedback: { greenCount: 3, yellowCount: 0, redCount: 1 },
      feedbackFolded: { greenCount: 1, yellowCount: 0, redCount: 0 },
    }),
    talk('talk-late'),
  ]
})

describe('getSpeakerFeedbackChips (§9.4)', () => {
  it('shows "Feedback Code" until feedback is visible, then the loved-it share and total', async () => {
    h.dataset.push(
      response('talk-early', 'green'),
      response('talk-early', 'yellow'),
    )
    expect(await chips()).toEqual({
      // 3 cards + 1 folded + 1 live green of 7 combined = 71 %
      'talk-early': { kind: 'results', lovedItPercent: 71, total: 7 },
      'talk-late': { kind: 'code' },
    })
  })

  it('never reads a response of a talk whose feedback is not visible yet', async () => {
    h.dataset.push(response('talk-late', 'red'))
    await chips(new Date('2026-06-10T06:00:00Z'))
    expect(h.queries.some((q) => q.includes('"feedbackResponse"'))).toBe(false)
  })

  it('keeps "Feedback Code" while answers can still arrive and none have', async () => {
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-early'
        ? { ...d, audienceFeedback: undefined, feedbackFolded: undefined }
        : d,
    )
    // talk-early ended at 07:40Z; its window is open until tomorrow.
    expect(await chips()).toEqual({
      'talk-early': { kind: 'code' },
      'talk-late': { kind: 'code' },
    })
  })

  it('shows no chip once the window has closed with nothing to show', async () => {
    h.dataset = h.dataset.map((d) =>
      d._id === 'talk-early'
        ? { ...d, audienceFeedback: undefined, feedbackFolded: undefined }
        : d,
    )
    // 2026-06-11 12:00Z: talk-early closed at 07:40Z, talk-late (no
    // answers either) is open until 13:40Z.
    expect(await chips(new Date('2026-06-11T12:00:00Z'))).toEqual({
      'talk-late': { kind: 'code' },
    })
  })

  it('leaves out talks that are not the speaker’s confirmed, published talks of this conference', async () => {
    h.dataset.push(
      talk('talk-co', { speakers: [ref('sp-bo')] }),
      talk('talk-accepted', { status: 'accepted' }),
      talk('talk-foreign', { conference: ref('conf-B') }),
      talk('drafts.talk-draft'),
    )
    expect(Object.keys(await chips()).sort()).toEqual([
      'talk-early',
      'talk-late',
    ])
  })

  it('counts only this talk’s responses in this conference, and no drafts', async () => {
    h.dataset.push(
      response('talk-early', 'red'),
      response('talk-late', 'green'),
      response('talk-early', 'green', 'conf-B'),
      { ...response('talk-early', 'green'), _id: 'drafts.feedbackResponse-x' },
    )
    // 4 green (3 cards + 1 folded) of 6 combined (+1 card red, +1 live red).
    expect((await chips())['talk-early']).toEqual({
      kind: 'results',
      lovedItPercent: 67,
      total: 6,
    })
  })

  it('needs no schedule once the conference is over: every talk is visible', async () => {
    h.dataset.push(response('talk-late', 'green'))
    expect(await chips(new Date('2026-06-13T12:00:00Z'))).toEqual({
      'talk-early': { kind: 'results', lovedItPercent: 80, total: 5 },
      'talk-late': { kind: 'results', lovedItPercent: 100, total: 1 },
    })
    expect(h.queries.some((q) => q.includes('"schedule"'))).toBe(false)
  })

  it('reads nothing more when the speaker has no confirmed talk here', async () => {
    h.dataset = [SCHEDULE, talk('talk-x', { status: 'submitted' })]
    expect(await chips()).toEqual({})
    expect(h.queries).toHaveLength(1)
  })
})
