import { describe, expect, it } from 'vitest'
import {
  getDefaultSections,
  resolveHomepageSections,
  hasPublishedSchedule,
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

describe('getDefaultSections — legacy layout equivalence', () => {
  it('always starts with hero then gallery, and ends with sponsors', () => {
    const sections = getDefaultSections(makeConference())
    expect(sections[0]._type).toBe('homepageHero')
    expect(sections[1]._type).toBe('homepageGallery')
    expect(sections[sections.length - 1]._type).toBe('homepageSponsors')
  })

  it('every section carries a stable _key', () => {
    const sections = getDefaultSections(
      makeConference({ organizers: [{ _id: 'o1', name: 'A' }] as never }),
    )
    for (const s of sections) expect(typeof s._key).toBe('string')
    const keys = sections.map((s) => s._key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses ProgramHighlights as the middle slot when a schedule is published', () => {
    const conference = makeConference({
      programDate: PAST,
      schedules: [{ _id: 's1' }] as never,
      // Featured speakers exist but a published schedule WINS (legacy if/else).
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
      'homepageGallery',
      'homepageOrganizers',
      'homepageSponsors',
    ])
  })

  it('omits the middle slot entirely when there is nothing to show', () => {
    const types = getDefaultSections(makeConference()).map((s) => s._type)
    expect(types).toEqual([
      'homepageHero',
      'homepageGallery',
      'homepageSponsors',
    ])
  })
})

describe('hasPublishedSchedule', () => {
  it('is false without schedules even after the program date', () => {
    expect(
      hasPublishedSchedule(
        makeConference({ programDate: PAST, schedules: [] }),
      ),
    ).toBe(false)
  })
  it('is false before the program date even with schedules', () => {
    expect(
      hasPublishedSchedule(
        makeConference({
          programDate: '2999-01-01',
          schedules: [{ _id: 's' }] as never,
        }),
      ),
    ).toBe(false)
  })
  it('is true after the program date with at least one schedule', () => {
    expect(
      hasPublishedSchedule(
        makeConference({
          programDate: PAST,
          schedules: [{ _id: 's' }] as never,
        }),
      ),
    ).toBe(true)
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
