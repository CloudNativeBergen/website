/**
 * @vitest-environment node
 *
 * The slot queries, the minter's seed and the bulk mint's talk listing
 * (speaker feedback spec §4.4, §6, #1459),
 * EXECUTED with groq-js against a two-tenant fixture and asserted on what
 * comes back. Published-only and the official-schedule filter live in the
 * query text, so a mocked reader could not prove them.
 *
 * Adversarial fixture: the talk also sits on a DRAFT schedule, an ARCHIVED
 * schedule, a `drafts.` copy of an official schedule, and another tenant's
 * official schedule, each at a time that would change the answer if it
 * counted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  options: [] as unknown[],
}))

async function run(
  query: string,
  params: Record<string, unknown> = {},
  options?: unknown,
) {
  h.options.push(options)
  const value = await evaluate(parse(query), { dataset: h.dataset, params })
  return value.get()
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: run },
  clientWrite: { withConfig: () => ({ fetch: run }) },
}))

import {
  conferenceFeedbackCodes,
  getConferenceFeedbackSlots,
  getConfirmedTalks,
  getFeedbackSlots,
} from './sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const entry = (talk: string, startTime: string, endTime: string) => ({
  _key: `${talk}-${startTime}`,
  talk: ref(talk),
  startTime,
  endTime,
})
const day = (
  id: string,
  conference: string,
  date: string,
  status: string | undefined,
  talks: unknown[],
) => ({
  _id: id,
  _type: 'schedule',
  conference: ref(conference),
  date,
  ...(status && { status }),
  tracks: [
    {
      _key: 'track-1',
      trackTitle: 'Main',
      talks: [
        { _key: 'ph', placeholder: 'Lunch', startTime: '12:00' },
        ...talks,
      ],
    },
    {
      _key: 'track-2',
      trackTitle: 'Side',
      talks: [entry('other', '10:00', '10:30')],
    },
  ],
})

beforeEach(() => {
  h.options = []
  h.dataset = [
    // Official, and a legacy day with no status (counts as official).
    day('day-1', 'conf-A', '2026-06-10', 'official', [
      entry('talk-1', '09:00', '09:40'),
    ]),
    day('day-2', 'conf-A', '2026-06-11', undefined, [
      entry('talk-1', '14:00', '14:40'),
    ]),
    // Must never count.
    day('day-draft', 'conf-A', '2026-06-09', 'draft', [
      entry('talk-1', '08:00', '08:40'),
    ]),
    day('day-archived', 'conf-A', '2026-06-08', 'archived', [
      entry('talk-1', '08:00', '08:40'),
    ]),
    day('drafts.day-1', 'conf-A', '2026-06-10', 'official', [
      entry('talk-1', '07:00', '07:40'),
    ]),
    day('versions.r1.day-1', 'conf-A', '2026-06-10', 'official', [
      entry('talk-1', '06:00', '06:40'),
    ]),
    day('day-B', 'conf-B', '2026-06-10', 'official', [
      entry('talk-1', '05:00', '05:40'),
    ]),
    // Codes, for the seed.
    {
      _id: 'talk-1',
      _type: 'talk',
      conference: ref('conf-A'),
      feedbackCode: 'aaaaaa',
    },
    {
      _id: 'drafts.talk-2',
      _type: 'talk',
      conference: ref('conf-A'),
      feedbackCode: 'bbbbbb',
    },
    {
      _id: 'versions.r1.talk-3',
      _type: 'talk',
      conference: ref('conf-A'),
      feedbackCode: 'cccccc',
    },
    { _id: 'talk-4', _type: 'talk', conference: ref('conf-A') },
    {
      _id: 'talk-B',
      _type: 'talk',
      conference: ref('conf-B'),
      feedbackCode: 'dddddd',
    },
    {
      _id: 'task-1',
      _type: 'marketingTask',
      conference: ref('conf-A'),
      shortCode: 'eeeeee',
    },
  ]
})

describe('getFeedbackSlots — published, official schedules of this conference only', () => {
  it('returns every slot of the talk across official days, and nothing else', async () => {
    const slots = await getFeedbackSlots('conf-A', 'talk-1')
    expect(
      [...slots].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    ).toEqual([
      { date: '2026-06-10', startTime: '09:00', endTime: '09:40' },
      { date: '2026-06-11', startTime: '14:00', endTime: '14:40' },
    ])
  })

  it('returns nothing for a talk that is only on a draft schedule', async () => {
    h.dataset = h.dataset.filter((d) => d._id !== 'day-1' && d._id !== 'day-2')
    expect(await getFeedbackSlots('conf-A', 'talk-1')).toEqual([])
  })

  it('does not match the drafts. id of a talk', async () => {
    h.dataset.push(
      day('day-3', 'conf-A', '2026-06-12', 'official', [
        entry('drafts.talk-1', '10:00', '10:40'),
      ]),
    )
    const slots = await getFeedbackSlots('conf-A', 'talk-1')
    expect(slots.map((s) => s.date)).not.toContain('2026-06-12')
  })
})

describe('conferenceFeedbackCodes — the minter seed includes drafts and versions', () => {
  it('returns the codes of every version of every talk in the conference', async () => {
    expect((await conferenceFeedbackCodes('conf-A')).sort()).toEqual([
      'aaaaaa',
      'bbbbbb',
      'cccccc',
    ])
  })

  it('reads in the raw perspective so the API returns versions', async () => {
    await conferenceFeedbackCodes('conf-A')
    expect(h.options.at(-1)).toMatchObject({ perspective: 'raw' })
  })
})

describe('getConferenceFeedbackSlots — every talk’s slots in one read (#1459)', () => {
  it('returns the same slots per talk as getFeedbackSlots, from official days only', async () => {
    const byTalk = await getConferenceFeedbackSlots('conf-A')
    const sorted = (id: string) =>
      [...(byTalk.get(id) ?? [])].sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      )
    expect(sorted('talk-1')).toEqual([
      { date: '2026-06-10', startTime: '09:00', endTime: '09:40' },
      { date: '2026-06-11', startTime: '14:00', endTime: '14:40' },
    ])
    expect(sorted('talk-1')).toEqual(
      [...(await getFeedbackSlots('conf-A', 'talk-1'))].sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      ),
    )
    expect(sorted('other')).toEqual([
      { date: '2026-06-10', startTime: '10:00', endTime: '10:30' },
      { date: '2026-06-11', startTime: '10:00', endTime: '10:30' },
    ])
    // Placeholders carry no talk, and nothing else is in the map.
    expect([...byTalk.keys()].sort()).toEqual(['other', 'talk-1'])
  })

  it('gives a slot without times null times, and skips an empty track', async () => {
    h.dataset.push({
      _id: 'day-3',
      _type: 'schedule',
      conference: ref('conf-A'),
      date: '2026-06-12',
      status: 'official',
      tracks: [
        { _key: 'empty', trackTitle: 'Empty' },
        {
          _key: 't',
          trackTitle: 'Main',
          talks: [{ _key: 's', talk: ref('talk-untimed') }],
        },
      ],
    })
    const byTalk = await getConferenceFeedbackSlots('conf-A')
    expect(byTalk.get('talk-untimed')).toEqual([
      { date: '2026-06-12', startTime: null, endTime: null },
    ])
  })

  it('returns an empty map for a conference with no schedule', async () => {
    expect((await getConferenceFeedbackSlots('conf-none')).size).toBe(0)
  })
})

describe('getConfirmedTalks — the bulk mint’s listing (#1459)', () => {
  const talk = (id: string, fields: Record<string, unknown> = {}) => ({
    _id: id,
    _type: 'talk',
    conference: ref('conf-C'),
    status: 'confirmed',
    title: id,
    speakers: [ref('sp-live')],
    ...fields,
  })
  beforeEach(() => {
    h.dataset = [
      { _id: 'sp-live', _type: 'speaker' },
      { _id: 'sp-erased', _type: 'speaker', erasedAt: '2026-05-01T00:00:00Z' },
      talk('c-live', { title: 'B talk', feedbackCode: 'aaaaaa' }),
      talk('c-erased', { title: 'A talk', speakers: [ref('sp-erased')] }),
      talk('c-co-spoken', {
        title: 'C talk',
        speakers: [ref('sp-erased'), ref('sp-live')],
      }),
      talk('c-deleted-speaker', {
        title: 'D talk',
        speakers: [ref('sp-gone')],
      }),
      talk('c-no-speakers', { title: 'E talk', speakers: undefined }),
      talk('c-untitled', { title: undefined }),
      // Never listed.
      talk('c-accepted', { status: 'accepted' }),
      talk('drafts.c-live', { title: 'B talk (draft)' }),
      talk('versions.r1.c-live', { title: 'B talk (release)' }),
      talk('c-other-tenant', { conference: ref('conf-D') }),
    ]
  })

  it('lists published confirmed talks of this conference, by title, with a live-speaker flag', async () => {
    // A missing title sorts last in GROQ.
    expect(await getConfirmedTalks('conf-C')).toEqual([
      {
        _id: 'c-erased',
        title: 'A talk',
        feedbackCode: null,
        hasLiveSpeaker: false,
      },
      {
        _id: 'c-live',
        title: 'B talk',
        feedbackCode: 'aaaaaa',
        hasLiveSpeaker: true,
      },
      {
        _id: 'c-co-spoken',
        title: 'C talk',
        feedbackCode: null,
        hasLiveSpeaker: true,
      },
      {
        _id: 'c-deleted-speaker',
        title: 'D talk',
        feedbackCode: null,
        hasLiveSpeaker: false,
      },
      // No speakers at all: false, not null.
      {
        _id: 'c-no-speakers',
        title: 'E talk',
        feedbackCode: null,
        hasLiveSpeaker: false,
      },
      {
        _id: 'c-untitled',
        title: null,
        feedbackCode: null,
        hasLiveSpeaker: true,
      },
    ])
  })
})
