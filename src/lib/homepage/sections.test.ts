import { describe, expect, it } from 'vitest'
import {
  getDefaultSections,
  resolveHomepageSections,
  isHomepageSectionType,
  HOMEPAGE_SECTION_TYPES,
  type HomepageSection,
} from './sections'
import type { Conference } from '@/lib/conference/types'

/** Minimal conference fixture — only the fields the section logic reads. */
function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Test Conf',
    programDate: '2999-01-01', // program NOT published by default
    schedules: [],
    featuredSpeakers: [],
    organizers: [],
    ...overrides,
  } as unknown as Conference
}

const PAST = '2000-01-01'

/** A published schedule that actually contains a confirmed talk. */
const LIVE_SCHEDULE = [
  {
    _id: 's1',
    date: '2999-01-01',
    tracks: [
      {
        trackTitle: 'Track 1',
        trackDescription: '',
        talks: [
          {
            startTime: '09:00',
            endTime: '09:45',
            talk: { _id: 't1', status: 'confirmed' },
          },
        ],
      },
    ],
  },
] as never

describe('getDefaultSections — legacy layout equivalence', () => {
  it('always starts with hero, ends with sponsors, and keeps gallery above the middle slot', () => {
    const sections = getDefaultSections(makeConference())
    expect(sections[0]._type).toBe('homepageHero')
    expect(sections[sections.length - 1]._type).toBe('homepageSponsors')
    const types = sections.map((s) => s._type)
    expect(types).toContain('homepageGallery')
    expect(types.indexOf('homepageGallery')).toBeLessThan(
      types.indexOf('homepageSponsors'),
    )
  })

  it('every section carries a stable _key', () => {
    const sections = getDefaultSections(
      makeConference({ organizers: [{ _id: 'o1', name: 'A' }] as never }),
    )
    for (const s of sections) expect(typeof s._key).toBe('string')
    const keys = sections.map((s) => s._key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses ProgramHighlights as the middle slot when a programme is published', () => {
    const conference = makeConference({
      programDate: PAST,
      schedules: LIVE_SCHEDULE,
      // Featured speakers exist but a published programme WINS (legacy if/else).
      featuredSpeakers: [{ _id: 'sp1' }] as never,
    })
    const types = getDefaultSections(conference).map((s) => s._type)
    expect(types).toEqual([
      'homepageHero',
      'homepageGallery',
      'homepageProgramHighlights',
      'homepageSponsors',
    ])
  })

  it('falls back to FeaturedSpeakers when no schedule but featured speakers exist', () => {
    const conference = makeConference({
      featuredSpeakers: [{ _id: 'sp1' }] as never,
      organizers: [{ _id: 'o1', name: 'A' }] as never,
    })
    const types = getDefaultSections(conference).map((s) => s._type)
    expect(types).toEqual([
      'homepageHero',
      'homepageGallery',
      'homepageFeaturedSpeakers',
      'homepageSponsors',
    ])
  })

  it('falls back to Organizers when no schedule and no featured speakers', () => {
    const conference = makeConference({
      organizers: [{ _id: 'o1', name: 'A' }] as never,
    })
    const types = getDefaultSections(conference).map((s) => s._type)
    expect(types).toEqual([
      'homepageHero',
      'homepageSaveTheDate',
      'homepageGallery',
      'homepageOrganizers',
      'homepageSponsors',
    ])
  })

  it('omits the middle slot entirely when there is nothing to show', () => {
    const types = getDefaultSections(makeConference()).map((s) => s._type)
    expect(types).toEqual([
      'homepageHero',
      'homepageSaveTheDate',
      'homepageGallery',
      'homepageSponsors',
    ])
  })
})

describe('getDefaultSections — lifecycle behaviour', () => {
  it('does NOT change the composition for a conference that has a programme', () => {
    const conference = makeConference({
      programDate: PAST,
      schedules: LIVE_SCHEDULE,
    })
    expect(getDefaultSections(conference).map((s) => s._type)).toEqual([
      'homepageHero',
      'homepageGallery',
      'homepageProgramHighlights',
      'homepageSponsors',
    ])
  })

  it('does NOT change the composition for a conference that has featured speakers', () => {
    const conference = makeConference({
      featuredSpeakers: [{ _id: 'sp1' }] as never,
    })
    expect(getDefaultSections(conference).map((s) => s._type)).toEqual([
      'homepageHero',
      'homepageGallery',
      'homepageFeaturedSpeakers',
      'homepageSponsors',
    ])
  })

  it('falls through to featured speakers when the published schedule is EMPTY', () => {
    // The cloudnativedaysitaly.org failure: publish pressed, schedule empty.
    // The old predicate handed the slot to ProgramHighlights, which then printed
    // a band of zeroes.
    const conference = makeConference({
      programDate: PAST,
      schedules: [{ _id: 's1', date: '2999-01-01', tracks: [] }] as never,
      featuredSpeakers: [{ _id: 'sp1' }] as never,
    })
    expect(getDefaultSections(conference).map((s) => s._type)).toEqual([
      'homepageHero',
      'homepageGallery',
      'homepageFeaturedSpeakers',
      'homepageSponsors',
    ])
  })

  it('adds the save-the-date band on day one', () => {
    const types = getDefaultSections(makeConference()).map((s) => s._type)
    expect(types[1]).toBe('homepageSaveTheDate')
  })

  it('does not add the save-the-date band after the event', () => {
    const conference = makeConference({
      startDate: PAST,
      endDate: PAST,
      organizers: [{ _id: 'o1', name: 'A' }] as never,
    })
    expect(getDefaultSections(conference).map((s) => s._type)).not.toContain(
      'homepageSaveTheDate',
    )
  })
})

describe('resolveHomepageSections', () => {
  it('returns the stored composition when non-empty', () => {
    const stored: HomepageSection[] = [
      { _key: 'a', _type: 'homepageHero' },
      {
        _key: 'b',
        _type: 'homepageCtaBanner',
        heading: 'Hi',
        buttonLabel: 'Go',
        buttonHref: '/x',
      },
    ]
    const conference = makeConference({ homepageSections: stored })
    expect(resolveHomepageSections(conference)).toBe(stored)
  })

  it('falls back to the default when the stored array is empty', () => {
    const conference = makeConference({ homepageSections: [] })
    const resolved = resolveHomepageSections(conference)
    expect(resolved.map((s) => s._type)).toEqual(
      getDefaultSections(conference).map((s) => s._type),
    )
  })

  it('falls back to the default when the field is absent (legacy conference)', () => {
    const conference = makeConference()
    const resolved = resolveHomepageSections(conference)
    expect(resolved[0]._type).toBe('homepageHero')
  })
})

describe('isHomepageSectionType', () => {
  it('accepts every registered type', () => {
    for (const t of HOMEPAGE_SECTION_TYPES) {
      expect(isHomepageSectionType(t)).toBe(true)
    }
  })
  it('rejects unknown values', () => {
    expect(isHomepageSectionType('homepageRawHtml')).toBe(false)
    expect(isHomepageSectionType(undefined)).toBe(false)
    expect(isHomepageSectionType(42)).toBe(false)
  })
})
