/**
 * The programme read the room screens use carries each track's sponsor
 * (GROQ executed by groq-js): without it every screen falls back to the loop.
 */
import { describe, expect, it } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { CONFERENCE_QUERY_FULL } from '@/lib/conference/query'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

const dataset = [
  {
    _id: 'conf-a',
    _type: 'conference',
    domains: ['conf-a.example'],
    schedules: [{ ...ref('tuesday'), _key: 'd' }],
  },
  {
    _id: 'tuesday',
    _type: 'schedule',
    conference: ref('conf-a'),
    date: '2026-10-27',
    tracks: [
      {
        _key: 't1',
        trackTitle: 'Proact IT - Lillesalen',
        talks: [],
        sponsor: { ...ref('proact'), _weak: true },
      },
      { _key: 't2', trackTitle: 'Hovedsalen', talks: [] },
    ],
  },
]

describe('the programme read carries track sponsors', () => {
  it("projects each track's sponsor reference", async () => {
    const conference = await (
      await evaluate(parse(CONFERENCE_QUERY_FULL), {
        dataset,
        params: {
          domain: 'conf-a.example',
          wildcardSubdomain: 'conf-a.example',
        },
      })
    ).get()
    expect(
      conference.__expanded.schedules[0].tracks.map(
        (t: { sponsor?: { _ref: string } | null }) => t.sponsor?._ref ?? null,
      ),
    ).toEqual(['proact', null])
  })
})
