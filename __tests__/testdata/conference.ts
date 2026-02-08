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
    start_date: '2026-06-15',
    end_date: '2026-06-15',
    cfp_start_date: '2026-01-01',
    cfp_end_date: '2026-03-01',
    cfp_notify_date: '2026-04-01',
    cfp_email: 'cfp@example.com',
    sponsor_email: 'sponsor@example.com',
    contact_email: 'contact@example.com',
    program_date: '2026-06-15',
    registration_enabled: true,
    domains: ['2026.cloudnativeday.no'],
    formats: [],
    topics: [],
    organizers: [],
    sponsors: [],
    ...overrides,
  } as Conference
}
