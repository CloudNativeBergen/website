/**
 * @jest-environment jsdom
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals'
import {
  getCurrentPhase,
  getPhaseContext,
  getPhaseName,
  getPhaseColor,
} from '@/lib/conference/phase'
import { Conference } from '@/lib/conference/types'

const baseConference: Conference = {
  _id: 'test-conference',
  title: 'Test Conference',
  organizer: 'Test Organizer',
  city: 'Bergen',
  country: 'Norway',
  tagline: 'Test Tagline',
  start_date: '2025-06-01',
  end_date: '2025-06-02',
  cfp_start_date: '2025-01-01',
  cfp_end_date: '2025-03-31',
  cfp_notify_date: '2025-04-15',
  cfp_email: 'cfp@test.com',
  sponsor_email: 'sponsor@test.com',
  program_date: '2025-05-01',
  registration_enabled: true,
  registration_link: 'https://tickets.test.com',
  contact_email: 'info@test.com',
  organizers: [],
  domains: ['test.cloudnativebergen.dev'],
  formats: [],
  topics: [],
}

describe('Conference Phase Detection', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('getCurrentPhase', () => {
    it('returns initialization before CFP opens', () => {
      jest.setSystemTime(new Date('2024-12-15T12:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('initialization')
    })

    it('returns planning when CFP is open', () => {
      jest.setSystemTime(new Date('2025-02-15T12:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('planning')
    })

    it('returns planning during review period (after CFP close, before program)', () => {
      jest.setSystemTime(new Date('2025-04-10T12:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('planning')
    })

    it('returns execution when program is published', () => {
      jest.setSystemTime(new Date('2025-05-15T12:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('execution')
    })

    it('returns execution during conference days', () => {
      jest.setSystemTime(new Date('2025-06-01T14:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('execution')
    })

    it('returns post-conference after event ends', () => {
      jest.setSystemTime(new Date('2025-06-03T12:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('post-conference')
    })
  })

  describe('getPhaseContext', () => {
    it('provides comprehensive context during planning phase', () => {
      jest.setSystemTime(new Date('2025-02-15T12:00:00Z'))
      const context = getPhaseContext(baseConference)

      expect(context.phase).toBe('planning')
      expect(context.isCfpOpen).toBe(true)
      expect(context.isProgramPublished).toBe(false)
      expect(context.isConferenceOver).toBe(false)

      // Should have positive days until future events
      expect(context.daysUntilCfpClose).toBeGreaterThan(0)
      expect(context.daysUntilNotification).toBeGreaterThan(0)
      expect(context.daysUntilConference).toBeGreaterThan(0)

      // Should have negative days until past event (CFP start)
      expect(context.daysUntilCfpStart).toBeLessThan(0)

      // Conference hasn't ended yet, so days since should be negative
      expect(context.daysSinceConference).toBeLessThan(0)
    })

    it('calculates countdown timers correctly', () => {
      jest.setSystemTime(new Date('2025-03-25T00:00:00Z'))
      const context = getPhaseContext(baseConference)

      // 6 days until CFP closes (March 31)
      expect(context.daysUntilCfpClose).toBe(6)

      // 21 days until notification (April 15)
      expect(context.daysUntilNotification).toBe(21)

      // 68 days until conference (June 1)
      expect(context.daysUntilConference).toBe(68)
    })

    it('provides post-conference metrics', () => {
      jest.setSystemTime(new Date('2025-06-10T12:00:00Z'))
      const context = getPhaseContext(baseConference)

      expect(context.phase).toBe('post-conference')
      expect(context.isConferenceOver).toBe(true)

      // Days since conference (June 2 end date)
      expect(context.daysSinceConference).toBe(9)
    })
  })

  describe('getPhaseName', () => {
    it('returns correct labels for all phases', () => {
      expect(getPhaseName('initialization')).toBe('Setup & Planning')
      expect(getPhaseName('planning')).toBe('CFP & Review')
      expect(getPhaseName('execution')).toBe('Pre-Event & Delivery')
      expect(getPhaseName('post-conference')).toBe('Post-Event')
    })
  })

  describe('getPhaseColor', () => {
    it('returns color schemes for all phases', () => {
      const initColors = getPhaseColor('initialization')
      expect(initColors.bg).toContain('blue')
      expect(initColors.text).toContain('blue')
      expect(initColors.border).toContain('blue')

      const planningColors = getPhaseColor('planning')
      expect(planningColors.bg).toContain('purple')

      const executionColors = getPhaseColor('execution')
      expect(executionColors.bg).toContain('amber')

      const postColors = getPhaseColor('post-conference')
      expect(postColors.bg).toContain('green')
    })
  })

  describe('edge cases', () => {
    it('handles missing dates gracefully', () => {
      const incompleteConference = {
        ...baseConference,
        cfp_start_date: '',
        program_date: '',
      }

      jest.setSystemTime(new Date('2025-02-15T12:00:00Z'))
      const phase = getCurrentPhase(incompleteConference)
      expect(phase).toBe('initialization')

      const context = getPhaseContext(incompleteConference)
      expect(context.daysUntilCfpStart).toBeNull()
      expect(context.daysUntilProgramRelease).toBeNull()
    })

    it('handles conference on boundary dates', () => {
      // Exactly on CFP start date
      jest.setSystemTime(new Date('2025-01-01T00:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('planning')

      // Exactly on CFP end date
      jest.setSystemTime(new Date('2025-03-31T23:59:59Z'))
      expect(getCurrentPhase(baseConference)).toBe('planning')

      // Day after CFP ends (still planning - review period)
      jest.setSystemTime(new Date('2025-04-01T00:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('planning')

      // Exactly on program date
      jest.setSystemTime(new Date('2025-05-01T00:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('execution')

      // Day after conference ends
      jest.setSystemTime(new Date('2025-06-03T00:00:00Z'))
      expect(getCurrentPhase(baseConference)).toBe('post-conference')
    })
  })
})
