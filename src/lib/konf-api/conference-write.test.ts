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

describe('movedConferencePatch settings phase 1 (#2019)', () => {
  it('sends every phase 1 key to D1, keeps nulls, and leaves Sanity owning them', () => {
    const input = {
      cfpStartDate: '2026-01-01',
      cfpEndDate: '2026-01-02',
      cfpNotifyDate: '2026-01-03',
      programDate: '2026-01-04',
      travelSupportPaymentDate: '2026-01-05',
      earlyBirdEndDate: '2026-01-06',
      registrationCloseDate: '2026-01-07',
      speakersAnnouncedDate: '2026-01-08',
      sponsorDeadlineDate: null,
      recordingsLiveDate: '2026-01-10',
      travelSupportBudget: 5000,
      registrationEnabled: false,
      organizer: 'Acme',
      organizerAddress: 'Street 1',
      organizerOrgNumber: '123',
      socialHashtag: '#acme',
      analyticsPirschCode: 'p',
    }
    expect(movedConferencePatch({ ...input, description: 'x' })).toEqual(input)
    // Not read from D1 yet, so Sanity still gets them.
    for (const k of Object.keys(input))
      expect(isMovedConferenceField(k)).toBe(false)
  })

  it('maps ticketCustomization to showVanityMetrics, absent as an unset', () => {
    expect(
      movedConferencePatch({
        ticketCustomization: { showVanityMetrics: true, heroHeadline: 'h' },
      }),
    ).toEqual({ showVanityMetrics: true })
    expect(
      movedConferencePatch({ ticketCustomization: { heroHeadline: 'h' } }),
    ).toEqual({ showVanityMetrics: null })
  })
})
