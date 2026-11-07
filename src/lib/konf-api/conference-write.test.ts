import { describe, expect, it, vi } from 'vitest'
import { mapBackfill } from '../../../services/conference/scripts/backfill'
import { PARITY_COLUMNS } from '../../../services/conference/src/data/parity-core'
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
    'organizerAddress',
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
  it('sends every phase 1 key to D1, keeps nulls, and moves only the public ones', () => {
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
    // Members-only fields have no member read path yet, so Sanity still
    // gets them; the public ones are read from D1 and moved.
    const privateKeys = [
      'travelSupportBudget',
      'organizerAddress',
      'organizerOrgNumber',
      'analyticsPirschCode',
    ]
    for (const k of Object.keys(input))
      expect(isMovedConferenceField(k)).toBe(!privateKeys.includes(k))
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

describe('movedConferencePatch settings phase 2 (#2038)', () => {
  it('sends every phase 2 key to D1, keeps nulls, and leaves Sanity owning them', () => {
    const input = {
      sponsorRegistrationLink: 'https://t.example/s',
      speakerRegistrationLink: 'https://t.example/sp',
      volunteerRegistrationLink: null,
      contactEmail: 'hi@acme.example',
      cfpEmail: 'cfp@acme.example',
      sponsorEmail: 'sponsor@acme.example',
      salesNotificationChannel: '#sales',
      cfpNotificationChannel: '#cfp',
      speakerSlackChannel: '#speakers',
      speakerSlackInviteUrl: 'https://join.slack.com/s',
      volunteerSlackInviteUrl: 'https://join.slack.com/v',
    }
    expect(movedConferencePatch({ ...input, description: 'x' })).toEqual(input)
    // Not read from D1 yet, so Sanity still gets them.
    for (const k of Object.keys(input))
      expect(isMovedConferenceField(k)).toBe(false)
  })
})

// #1917: the daily parity sweep compares only columns the site still writes to
// D1 and Sanity. A column that moves to D1-only must leave PARITY_COLUMNS in
// the same change, or every edit to it reads as drift; a dual-written column
// missing from it goes unchecked.
describe('parity columns agree with the write split (#1917)', () => {
  const camel = (col: string) =>
    col === 'organizer_name'
      ? 'organizer'
      : col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  // Not a settings input key: the row's identity, lifecycleStatus's derived
  // gate, and showVanityMetrics (nested; the tickets router writes it to D1
  // only for d1_write tenants).
  const SPECIAL = [
    'conference_id',
    'org_id',
    'published',
    'show_vanity_metrics',
    // Written by the reminder to Sanity only, until its D1 write (#2080).
    'workshop_reminder_last_sent_at',
    'workshop_reminder_last_sent_count',
    'workshop_reminder_reserved_at',
  ]
  const columns = Object.keys(
    mapBackfill([{ _id: 'c', orgId: 'o' }], new Set(['c'])).rows[0],
  ).filter((c) => !SPECIAL.includes(c))
  const compared = new Set<string>(PARITY_COLUMNS)

  it.each(columns)('%s is moved or compared, not both', (col) => {
    expect(isMovedConferenceField(camel(col))).toBe(!compared.has(col))
  })

  it('compares org_id and published, and not the frozen showVanityMetrics', () => {
    expect(compared.has('org_id')).toBe(true)
    expect(compared.has('published')).toBe(true)
    expect(compared.has('show_vanity_metrics')).toBe(false)
    expect(columns.length).toBeGreaterThan(40)
  })
})
