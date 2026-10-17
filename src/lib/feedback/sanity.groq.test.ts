/**
 * @vitest-environment node
 *
 * The slot query and the minter's seed (speaker feedback spec §4.4, §6),
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

import { conferenceFeedbackCodes, getFeedbackSlots } from './sanity'

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
