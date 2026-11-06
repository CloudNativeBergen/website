import { describe, expect, it, vi } from 'vitest'
import { mapBackfill } from '../../../services/conference/scripts/backfill'
import {
  isMovedConferenceField,
  movedConferencePatch,
} from './conference-write'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({}))

describe('movedConferencePatch published (#1892)', () => {
  // The D1 write must derive `published` exactly as the backfill (and so the
  // parity sweep) does, or every lifecycle change reads as daily drift.
  it.each([['cancelled'], ['archived'], [null], ['something-else']])(
    'matches the backfill for lifecycleStatus %s',
    (lifecycleStatus) => {
      const backfill = mapBackfill(
        [{ _id: 'c', orgId: 'o', lifecycleStatus }],
        new Set(['c']),
      ).rows[0].published
      expect(movedConferencePatch({ lifecycleStatus }).published).toBe(
        backfill === 1,
      )
    },
  )

  it('leaves published untouched when the lifecycle is not in the input', () => {
    expect(movedConferencePatch({ title: 'x' })).not.toHaveProperty('published')
  })
})

describe('isMovedConferenceField (#1997)', () => {
  it.each([
    'title',
    'tagline',
    'city',
    'country',
    'venueName',
    'venueAddress',
    'startDate',
    'endDate',
    'backgroundPattern',
    'primaryColor',
    'accentColor',
    'registrationLink',
    'visibility',
    'socialLinks',
    'theme',
  ])('recognises %s as a moved field', (key) => {
    expect(isMovedConferenceField(key)).toBe(true)
  })

  it.each([
    'description',
    'organizer',
    'contactEmail',
    'sponsorEmail',
    'volunteerRegistrationLink',
    'cateringInfo',
    'travelInfo',
    'announcement',
    'homepageSections',
    'logoBright',
    'domains',
    'topics',
    'lifecycleStatus',
  ])('recognises %s as a non-moved field', (key) => {
    expect(isMovedConferenceField(key)).toBe(false)
  })
})
