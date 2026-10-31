import { describe, expect, it } from 'vitest'
import { pickCfpConference } from '@/lib/conference/logo'
import type { Conference } from '@/lib/conference/types'
import { CFP_DASHBOARD_CONFERENCE_FIELDS } from './types'

/**
 * The (cfp) pages hand conference data to client components, so every field
 * listed here ends up in the speaker's browser (#980, #1795). Adding a field
 * is fine when a client component renders it; this test makes that a
 * deliberate change.
 */
const SERVER_ONLY = [
  'agentConfig',
  'checkinCustomerId',
  'checkinEventId',
  'sponsorEmail',
  'organizer',
  'teams',
  'travelSupportBudget',
  'sponsorRevenueGoal',
  'ticketTargets',
  'ticketCapacity',
  'cfpSubmissionGoal',
  'schedules',
  'description',
]

describe('(cfp) conference field lists', () => {
  it('pins the dashboard projection', () => {
    expect(CFP_DASHBOARD_CONFERENCE_FIELDS).toEqual([
      '_id',
      'title',
      'organization',
      'city',
      'country',
      'venueName',
      'venueAddress',
      'startDate',
      'endDate',
      'cfpStartDate',
      'cfpEndDate',
      'cfpNotifyDate',
      'cfpEmail',
      'contactEmail',
      'domains',
      'socialHashtag',
      'socialLinks',
    ])
  })

  it('pins the proposal pages pick', () => {
    const full = Object.fromEntries(
      [...SERVER_ONLY, 'cfpEmail', 'formats', 'topics', 'title'].map((k) => [
        k,
        k,
      ]),
    ) as unknown as Conference
    expect(Object.keys(pickCfpConference(full)).sort()).toEqual(
      [
        'cfpEmail',
        'cfpEndDate',
        'cfpNotifyDate',
        'cfpStartDate',
        'endDate',
        'formats',
        'startDate',
        'topics',
      ].sort(),
    )
  })

  it('keeps server-only and large fields out', () => {
    for (const field of SERVER_ONLY) {
      expect(CFP_DASHBOARD_CONFERENCE_FIELDS).not.toContain(field)
    }
  })
})
