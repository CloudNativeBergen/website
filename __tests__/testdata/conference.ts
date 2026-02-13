import type { Conference } from '@/lib/conference/types'

export function createMockConference(
  overrides: Partial<Conference> = {},
): Conference {
  return {
    _id: 'conf-1',
    title: 'Cloud Native Day 2026',
    organizer: 'Cloud Native Bergen',
    city: 'Bergen',
    country: 'Norway',
    startDate: '2026-06-15',
    endDate: '2026-06-15',
    cfpStartDate: '2026-01-01',
    cfpEndDate: '2026-03-01',
    cfpNotifyDate: '2026-04-01',
    cfpEmail: 'cfp@example.com',
    sponsorEmail: 'sponsor@example.com',
    contactEmail: 'contact@example.com',
    programDate: '2026-06-15',
    registrationEnabled: true,
    domains: ['2026.cloudnativedays.no'],
    formats: [],
    topics: [],
    organizers: [],
    sponsors: [],
    ...overrides,
  } as Conference
}
