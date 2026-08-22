/**
 * SECTION SELECTION — the half of the cache collapse that can silently change
 * what a page renders.
 *
 * Collapsing twelve GROQ variants onto two means the FLAGS no longer decide
 * what is fetched, only what is handed back. Every shape the old per-flag
 * queries produced now has to be reproduced here, in TypeScript, and the
 * failure mode is the one AGENTS.md calls out: a section that comes back
 * missing is `undefined`, not an error, so it breaks silently in production.
 *
 * Two shapes matter most and are easy to get backwards:
 *
 *  - A caller that did NOT ask for a section must still see the RAW REFERENCE
 *    ARRAY the `...` spread returns (`{_ref,_type,_key}`), because that is what
 *    it has always seen and some callers count it (`organizers.length` for the
 *    organizer ticket allocation).
 *  - `confirmedTalksOnly` used to be a GROQ filter. It is now a local filter,
 *    and it must keep EXACTLY the slots the GROQ predicate kept — including the
 *    two edge cases the predicate handled implicitly: a slot with no talk
 *    reference at all (a break/service session) is KEPT, and a slot whose
 *    reference dangles because the proposal was deleted is DROPPED.
 */

import { describe, expect, it } from 'vitest'
import type { Conference } from '@/lib/conference/types'
import {
  EXPANDED_SECTIONS_KEY,
  selectConferenceSections,
  withConfirmedTalksOnly,
  type RawConferenceRead,
} from '@/lib/conference/sections'

const ORGANIZER_REFS = [
  { _key: 'a', _ref: 'speaker-1', _type: 'reference' },
  { _key: 'b', _ref: 'speaker-2', _type: 'reference' },
]
const TOPIC_REFS = [{ _key: 't', _ref: 'topic-1', _type: 'reference' }]
const SCHEDULE_REFS = [{ _key: 's', _ref: 'schedule-1', _type: 'reference' }]

const EXPANDED_ORGANIZERS = [
  { _id: 'speaker-1', name: 'Ada', slug: 'ada' },
  { _id: 'speaker-2', name: 'Grace', slug: 'grace' },
]
const EXPANDED_TOPICS = [{ _id: 'topic-1', title: 'Platform' }]

/** A slot whose talk is confirmed — kept by both views. */
const CONFIRMED_SLOT = {
  startTime: '09:00',
  endTime: '09:30',
  hasTalkRef: true,
  talk: { _id: 'talk-1', title: 'Confirmed', status: 'confirmed' },
}
/** A slot whose talk is still a draft — dropped by the confirmed-only view. */
const DRAFT_SLOT = {
  startTime: '10:00',
  endTime: '10:30',
  hasTalkRef: true,
  talk: { _id: 'talk-2', title: 'Not yet accepted', status: 'submitted' },
}
/** A break. No talk reference at all — `!defined(talk)` KEPT it. */
const SERVICE_SLOT = {
  startTime: '11:00',
  endTime: '11:15',
  placeholder: 'Coffee',
  hasTalkRef: false,
}
/** Reference present, proposal deleted. `talk->status` was null — DROPPED. */
const DANGLING_SLOT = {
  startTime: '12:00',
  endTime: '12:30',
  hasTalkRef: true,
}

function rawRead(
  expanded: Record<string, unknown> = {},
): RawConferenceRead & Record<string, unknown> {
  return {
    _id: 'conference-1',
    title: 'Example Conf',
    organizers: ORGANIZER_REFS,
    topics: TOPIC_REFS,
    schedules: SCHEDULE_REFS,
    [EXPANDED_SECTIONS_KEY]: {
      organizers: EXPANDED_ORGANIZERS,
      topics: EXPANDED_TOPICS,
      featuredSpeakers: null,
      featuredTalks: null,
      sponsorTiers: [{ _id: 'tier-1', title: 'Gold' }],
      schedules: [
        {
          _id: 'schedule-1',
          date: '2026-06-01',
          tracks: [
            {
              trackTitle: 'Main',
              trackDescription: '',
              talks: [CONFIRMED_SLOT, DRAFT_SLOT, SERVICE_SLOT, DANGLING_SLOT],
            },
          ],
        },
      ],
      ...expanded,
    },
  } as unknown as RawConferenceRead & Record<string, unknown>
}

const NOTHING = {
  organizers: false,
  featuredSpeakers: false,
  featuredTalks: false,
  sponsorTiers: false,
  topics: false,
  schedule: false,
  confirmedTalksOnly: true,
}

describe('selectConferenceSections', () => {
  it('leaves un-requested sections as the RAW REFERENCE arrays', () => {
    const conference = selectConferenceSections(rawRead(), NOTHING)

    // Not `[]`, not the expanded documents — the refs, byte for byte. Callers
    // that never opted in have always read these.
    expect(conference.organizers).toEqual(ORGANIZER_REFS)
    expect(conference.topics).toEqual(TOPIC_REFS)
    expect(conference.schedules).toEqual(SCHEDULE_REFS)
  })

  it('swaps in the dereferenced documents for the sections that were requested', () => {
    const conference = selectConferenceSections(rawRead(), {
      ...NOTHING,
      organizers: true,
      topics: true,
    })

    expect(conference.organizers).toEqual(EXPANDED_ORGANIZERS)
    expect(conference.topics).toEqual(EXPANDED_TOPICS)
    // Still not requested, so still refs — asking for one section must not
    // expand another.
    expect(conference.schedules).toEqual(SCHEDULE_REFS)
  })

  it('omits sponsorTiers entirely when not requested', () => {
    // `sponsorTiers` is a SUBQUERY, not a document field: there is no raw form,
    // and the old query simply produced no key. A `[]` here would read as "this
    // conference has no tiers" to a caller that never asked.
    const conference = selectConferenceSections(
      rawRead(),
      NOTHING,
    ) as unknown as Record<string, unknown>

    expect('sponsorTiers' in conference).toBe(false)
  })

  it('preserves a null section verbatim rather than tidying it to undefined', () => {
    const conference = selectConferenceSections(rawRead(), {
      ...NOTHING,
      featuredSpeakers: true,
    }) as unknown as Record<string, unknown>

    // GROQ returns `null`, not an absent key, for a projection over a field the
    // document lacks. Coercing it here would be a shape change hidden inside a
    // performance change.
    expect(conference.featuredSpeakers).toBeNull()
  })

  it('never leaks the internal expansion key to callers', () => {
    const conference = selectConferenceSections(rawRead(), {
      ...NOTHING,
      organizers: true,
    }) as unknown as Record<string, unknown>

    // It would otherwise be serialized into the RSC payload of every public
    // page, carrying the full superset the caller deliberately did not ask for.
    expect(EXPANDED_SECTIONS_KEY in conference).toBe(false)
  })

  it('returns a fresh object so one caller cannot mutate another caller shape', () => {
    // One cache entry now backs every flag combination, and the caller attaches
    // sponsors and gallery images to what it gets back. If that were the cached
    // object itself, whichever page rendered first would decide what the next
    // one sees.
    const raw = rawRead()
    const conference = selectConferenceSections(raw, {
      ...NOTHING,
      organizers: true,
    })

    expect(conference).not.toBe(raw)
    ;(conference as unknown as Record<string, unknown>).sponsors = ['x']
    expect((raw as Record<string, unknown>).sponsors).toBeUndefined()
    // And the un-narrowed source still holds the raw refs for the next caller.
    expect(raw.organizers).toEqual(ORGANIZER_REFS)
  })
})

describe('withConfirmedTalksOnly — the GROQ predicate, moved into TypeScript', () => {
  it('keeps confirmed talks and service sessions, drops drafts and dangling refs', () => {
    const conference = selectConferenceSections(rawRead(), {
      ...NOTHING,
      schedule: true,
      confirmedTalksOnly: true,
    })

    const talks = conference.schedules![0].tracks[0].talks
    expect(talks.map((t) => t.talk?._id ?? t.placeholder)).toEqual([
      'talk-1',
      // The break survives: `!defined(talk)` was the first arm of the predicate.
      'Coffee',
    ])
  })

  it('keeps every slot when the caller asked for all of them', () => {
    const conference = selectConferenceSections(rawRead(), {
      ...NOTHING,
      schedule: true,
      confirmedTalksOnly: false,
    })

    expect(conference.schedules![0].tracks[0].talks).toHaveLength(4)
  })

  it('does not mutate the schedule it filters', () => {
    // The confirmed-only and the unfiltered callers now share ONE cache entry.
    // An in-place filter would let the homepage silently truncate `/program`.
    const raw = rawRead()
    const before =
      raw[EXPANDED_SECTIONS_KEY]!.schedules![0].tracks[0].talks.length

    withConfirmedTalksOnly(raw[EXPANDED_SECTIONS_KEY]!.schedules!)

    expect(
      raw[EXPANDED_SECTIONS_KEY]!.schedules![0].tracks[0].talks.length,
    ).toBe(before)
    expect(before).toBe(4)
  })

  it('passes a null or undefined schedule straight through', () => {
    expect(withConfirmedTalksOnly(null)).toBeNull()
    expect(withConfirmedTalksOnly(undefined)).toBeUndefined()
  })
})
