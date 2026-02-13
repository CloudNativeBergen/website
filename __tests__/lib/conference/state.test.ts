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
  isConferenceOver,
  isCfpOpen,
  isProgramPublished,
  isRegistrationAvailable,
  isWorkshopRegistrationOpen,
  isSeekingSponsors,
} from '@/lib/conference/state'
import { Conference } from '@/lib/conference/types'

const baseConference: Conference = {
  _id: 'test-conference',
  title: 'Test Conference',
  organizer: 'Test Organizer',
  city: 'Bergen',
  country: 'Norway',
  tagline: 'Test Tagline',
  startDate: '2025-06-01',
  endDate: '2025-06-02',
  cfpStartDate: '2025-01-01',
  cfpEndDate: '2025-03-31',
  cfpNotifyDate: '2025-04-15',
  cfpEmail: 'cfp@test.com',
  programDate: '2025-05-01',
  registrationEnabled: true,
  registrationLink: 'https://tickets.test.com',
  contactEmail: 'info@test.com',
  sponsorEmail: 'sponsors@test.com',
  organizers: [],
  domains: ['test.example.com'],
  formats: [],
  topics: [],
}

describe('Conference State Helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('isConferenceOver', () => {
    it('returns false before conference ends', () => {
      jest.setSystemTime(new Date('2025-06-01T12:00:00Z'))
      expect(isConferenceOver(baseConference)).toBe(false)
    })

    it('returns false on end date', () => {
      jest.setSystemTime(new Date('2025-06-02T23:59:59Z'))
      expect(isConferenceOver(baseConference)).toBe(false)
    })

    it('returns true day after conference ends', () => {
      jest.setSystemTime(new Date('2025-06-03T00:00:00Z'))
      expect(isConferenceOver(baseConference)).toBe(true)
    })

    it('returns true after conference ends', () => {
      jest.setSystemTime(new Date('2025-06-10T12:00:00Z'))
      expect(isConferenceOver(baseConference)).toBe(true)
    })
  })

  describe('isCfpOpen', () => {
    it('returns true during CFP period', () => {
      jest.setSystemTime(new Date('2025-02-15T12:00:00Z'))
      expect(isCfpOpen(baseConference)).toBe(true)
    })

    it('returns true on start date', () => {
      jest.setSystemTime(new Date('2025-01-01T00:00:00Z'))
      expect(isCfpOpen(baseConference)).toBe(true)
    })

    it('returns true on end date', () => {
      jest.setSystemTime(new Date('2025-03-31T23:59:59Z'))
      expect(isCfpOpen(baseConference)).toBe(true)
    })

    it('returns false before CFP starts', () => {
      jest.setSystemTime(new Date('2024-12-31T23:59:59Z'))
      expect(isCfpOpen(baseConference)).toBe(false)
    })

    it('returns false after CFP ends', () => {
      jest.setSystemTime(new Date('2025-04-01T00:00:00Z'))
      expect(isCfpOpen(baseConference)).toBe(false)
    })

    it('returns false when dates are missing', () => {
      const conferenceNoDates = {
        ...baseConference,
        cfpStartDate: '',
        cfpEndDate: '',
      }
      expect(isCfpOpen(conferenceNoDates)).toBe(false)
    })
  })

  describe('isProgramPublished', () => {
    it('returns true after program date', () => {
      jest.setSystemTime(new Date('2025-05-02T12:00:00Z'))
      expect(isProgramPublished(baseConference)).toBe(true)
    })

    it('returns true on program date', () => {
      jest.setSystemTime(new Date('2025-05-01T00:00:00Z'))
      expect(isProgramPublished(baseConference)).toBe(true)
    })

    it('returns false before program date', () => {
      jest.setSystemTime(new Date('2025-04-30T23:59:59Z'))
      expect(isProgramPublished(baseConference)).toBe(false)
    })

    it('returns false when program date is missing', () => {
      const conferenceNoProgram = {
        ...baseConference,
        programDate: '',
      }
      expect(isProgramPublished(conferenceNoProgram)).toBe(false)
    })
  })

  describe('isRegistrationAvailable', () => {
    it('returns true when enabled, link exists, and conference not over', () => {
      jest.setSystemTime(new Date('2025-05-15T12:00:00Z'))
      expect(isRegistrationAvailable(baseConference)).toBe(true)
    })

    it('returns false when registration disabled', () => {
      jest.setSystemTime(new Date('2025-05-15T12:00:00Z'))
      const conference = { ...baseConference, registrationEnabled: false }
      expect(isRegistrationAvailable(conference)).toBe(false)
    })

    it('returns false when registration link missing', () => {
      jest.setSystemTime(new Date('2025-05-15T12:00:00Z'))
      const conference = { ...baseConference, registrationLink: undefined }
      expect(isRegistrationAvailable(conference)).toBe(false)
    })

    it('returns false when conference is over', () => {
      jest.setSystemTime(new Date('2025-06-03T12:00:00Z'))
      expect(isRegistrationAvailable(baseConference)).toBe(false)
    })

    it('returns false on day after conference', () => {
      jest.setSystemTime(new Date('2025-06-03T00:00:00Z'))
      expect(isRegistrationAvailable(baseConference)).toBe(false)
    })

    it('returns true on conference end date', () => {
      jest.setSystemTime(new Date('2025-06-02T23:59:59Z'))
      expect(isRegistrationAvailable(baseConference)).toBe(true)
    })
  })

  describe('isWorkshopRegistrationOpen', () => {
    const workshopConference = {
      ...baseConference,
      workshopRegistrationStart: '2025-05-01',
      workshopRegistrationEnd: '2025-05-15',
    }

    it('returns true during registration period', () => {
      jest.setSystemTime(new Date('2025-05-10T12:00:00Z'))
      expect(isWorkshopRegistrationOpen(workshopConference)).toBe(true)
    })

    it('returns false before registration starts', () => {
      jest.setSystemTime(new Date('2025-04-30T23:59:59Z'))
      expect(isWorkshopRegistrationOpen(workshopConference)).toBe(false)
    })

    it('returns false after registration ends', () => {
      jest.setSystemTime(new Date('2025-05-16T00:00:00Z'))
      expect(isWorkshopRegistrationOpen(workshopConference)).toBe(false)
    })

    it('returns false when dates are missing', () => {
      expect(isWorkshopRegistrationOpen(baseConference)).toBe(false)
    })
  })

  describe('isSeekingSponsors', () => {
    it('returns true more than 4 weeks before conference', () => {
      jest.setSystemTime(new Date('2025-04-01T12:00:00Z'))
      expect(isSeekingSponsors(baseConference)).toBe(true)
    })

    it('returns false less than 4 weeks before conference', () => {
      jest.setSystemTime(new Date('2025-05-25T12:00:00Z'))
      expect(isSeekingSponsors(baseConference)).toBe(false)
    })

    it('returns false when start date is missing', () => {
      const conferenceNoStart = { ...baseConference, startDate: '' }
      expect(isSeekingSponsors(conferenceNoStart)).toBe(false)
    })
  })
})
