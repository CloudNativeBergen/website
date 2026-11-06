/**
 * @vitest-environment node
 *
 * An unconfirmed talk keeps its slot but never its title, description,
 * language, speakers or id. Two layers, one test each:
 *  - GROQ: SCHEDULE_TRACKS, evaluated by groq-js on a fixture dataset.
 *  - code: SanityProgramSource, fed rows a leaky projection would return.
 */
import { describe, expect, it } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { SCHEDULE_TRACKS } from '../../../../src/lib/proposal/public-groq'
import { SanityProgramSource } from './source'

const tenant = { conferenceId: 'conf_a', orgId: 'org_a' } as never
const STATUSES = ['accepted', 'withdrawn', 'confirmed']

const talk = (status: string) => ({
  _id: `talk_${status}`,
  _type: 'talk',
  status,
  title: 'Secret title',
  description: [{ _type: 'block', children: [{ text: 'Secret' }] }],
  language: 'en',
  format: 'presentation_40',
  level: 'beginner',
  speakers: [{ _type: 'reference', _ref: 'sp_a' }],
})
const dataset = [
  {
    _id: 'sp_a',
    _type: 'speaker',
    name: 'Ada Secret',
    slug: { current: 'ada' },
  },
  ...STATUSES.map(talk),
  {
    _id: 'sch',
    _type: 'schedule',
    tracks: [
      {
        trackTitle: 'Main',
        talks: STATUSES.map((s, i) => ({
          startTime: `1${i}:00`,
          endTime: `1${i}:40`,
          talk: { _type: 'reference', _ref: `talk_${s}` },
        })),
      },
    ],
  },
]

describe('SCHEDULE_TRACKS (GROQ layer)', () => {
  it('nulls title, description, language and speakers unless confirmed', async () => {
    const q = `*[_type == "schedule"][0]{ ${SCHEDULE_TRACKS} }`
    const out = (await (await evaluate(parse(q), { dataset })).get()) as {
      tracks: { talks: { talk: Record<string, unknown> }[] }[]
    }
    const [pending, withdrawn, confirmed] = out.tracks[0].talks.map(
      (s) => s.talk,
    )
    for (const t of [pending, withdrawn]) {
      expect(t.format).toBe('presentation_40')
      for (const k of ['title', 'description', 'language', 'speakers'])
        expect(t[k] ?? null).toBeNull()
    }
    expect(confirmed.title).toBe('Secret title')
    expect(confirmed.speakers).toHaveLength(1)
  })
})

describe('SanityProgramSource.program (code layer)', () => {
  it('nulls id, title, description, language and speakers unless confirmed', async () => {
    // A leaky projection: every field present whatever the status.
    const leaky = (status: string) => ({
      ...talk(status),
      speakers: [{ _id: 'sp_a', name: 'Ada Secret' }],
    })
    const source = new SanityProgramSource({
      fetch: (async () => [
        {
          _id: 'sch',
          date: '2026-06-01',
          tracks: [
            {
              trackTitle: 'Main',
              talks: STATUSES.map((s, i) => ({
                startTime: `1${i}:00`,
                hasTalkRef: true,
                talk: leaky(s),
              })),
            },
          ],
        },
      ]) as never,
    })
    const slots = (await source.program(tenant))[0].slots
    expect(slots.map((s) => s.talkStatus)).toEqual([
      'PENDING',
      'PENDING',
      'CONFIRMED',
    ])
    for (const s of slots.slice(0, 2))
      expect(s.talk).toMatchObject({
        id: null,
        title: null,
        description: null,
        language: null,
        speakers: null,
        format: 'presentation_40',
      })
    expect(slots[2].talk).toMatchObject({
      id: 'talk_confirmed',
      title: 'Secret title',
    })
  })
})
