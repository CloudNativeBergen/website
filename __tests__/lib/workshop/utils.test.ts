import { describe, it, expect } from '@jest/globals'
import {
  getWorkshopDuration,
  formatTime,
  getWorkshopDateTime,
  checkTimeOverlap,
  checkWorkshopTimeConflict,
  getWorkshopIdFromSignup,
} from '@/lib/workshop/utils'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { Format, Status, Language, Level } from '@/lib/proposal/types'

describe('Workshop Utils', () => {
  describe('getWorkshopDuration', () => {
    it('returns 2 hours for workshop_120 format', () => {
      expect(getWorkshopDuration('workshop_120' as Format)).toBe('2 hours')
    })

    it('returns 4 hours for workshop_240 format', () => {
      expect(getWorkshopDuration('workshop_240' as Format)).toBe('4 hours')
    })

    it('defaults to 2 hours for other formats', () => {
      expect(getWorkshopDuration('talk' as Format)).toBe('2 hours')
      expect(getWorkshopDuration('lightning' as Format)).toBe('2 hours')
    })
  })

  describe('formatTime', () => {
    it('formats morning times correctly', () => {
      expect(formatTime('09:00')).toBe('9:00 AM')
      expect(formatTime('08:30')).toBe('8:30 AM')
    })

    it('formats noon correctly', () => {
      expect(formatTime('12:00')).toBe('12:00 PM')
    })

    it('formats afternoon times correctly', () => {
      expect(formatTime('13:00')).toBe('1:00 PM')
      expect(formatTime('15:30')).toBe('3:30 PM')
      expect(formatTime('18:45')).toBe('6:45 PM')
    })

    it('formats midnight correctly', () => {
      expect(formatTime('00:00')).toBe('12:00 AM')
    })

    it('preserves minutes', () => {
      expect(formatTime('14:15')).toBe('2:15 PM')
      expect(formatTime('09:45')).toBe('9:45 AM')
    })
  })

  describe('getWorkshopDateTime', () => {
    it('uses direct properties when available', () => {
      const workshop = {
        date: '2025-11-15',
        startTime: '09:00',
        endTime: '11:00',
        room: 'Room A',
      } as ProposalWithWorkshopData

      const result = getWorkshopDateTime(workshop)

      expect(result).toEqual({
        date: '2025-11-15',
        startTime: '09:00',
        endTime: '11:00',
        room: 'Room A',
      })
    })

    it('falls back to scheduleInfo when direct properties are missing', () => {
      const workshop = {
        scheduleInfo: {
          date: '2025-11-16',
          timeSlot: {
            startTime: '13:00',
            endTime: '15:00',
          },
          room: 'Room B',
        },
      } as ProposalWithWorkshopData

      const result = getWorkshopDateTime(workshop)

      expect(result).toEqual({
        date: '2025-11-16',
        startTime: '13:00',
        endTime: '15:00',
        room: 'Room B',
      })
    })

    it('prefers direct properties over scheduleInfo', () => {
      const workshop = {
        date: '2025-11-15',
        startTime: '09:00',
        endTime: '11:00',
        room: 'Room A',
        scheduleInfo: {
          date: '2025-11-16',
          timeSlot: {
            startTime: '13:00',
            endTime: '15:00',
          },
          room: 'Room B',
        },
      } as ProposalWithWorkshopData

      const result = getWorkshopDateTime(workshop)

      expect(result).toEqual({
        date: '2025-11-15',
        startTime: '09:00',
        endTime: '11:00',
        room: 'Room A',
      })
    })

    it('returns undefined for missing properties', () => {
      const workshop = {} as ProposalWithWorkshopData

      const result = getWorkshopDateTime(workshop)

      expect(result).toEqual({
        date: undefined,
        startTime: undefined,
        endTime: undefined,
        room: undefined,
      })
    })
  })

  describe('checkTimeOverlap', () => {
    it('detects overlap when first workshop starts during second', () => {
      expect(checkTimeOverlap('10:00', '12:00', '09:00', '11:00')).toBe(true)
    })

    it('detects overlap when first workshop ends during second', () => {
      expect(checkTimeOverlap('09:00', '11:00', '10:00', '12:00')).toBe(true)
    })

    it('detects overlap when first workshop contains second', () => {
      expect(checkTimeOverlap('09:00', '13:00', '10:00', '12:00')).toBe(true)
    })

    it('detects overlap when second workshop contains first', () => {
      expect(checkTimeOverlap('10:00', '12:00', '09:00', '13:00')).toBe(true)
    })

    it('detects exact overlap', () => {
      expect(checkTimeOverlap('10:00', '12:00', '10:00', '12:00')).toBe(true)
    })

    it('returns false when workshops are back-to-back (no overlap)', () => {
      expect(checkTimeOverlap('09:00', '11:00', '11:00', '13:00')).toBe(false)
    })

    it('returns false when first workshop is before second', () => {
      expect(checkTimeOverlap('09:00', '10:00', '11:00', '12:00')).toBe(false)
    })

    it('returns false when first workshop is after second', () => {
      expect(checkTimeOverlap('13:00', '14:00', '09:00', '10:00')).toBe(false)
    })

    it('handles times with minutes correctly', () => {
      expect(checkTimeOverlap('09:30', '11:30', '11:00', '13:00')).toBe(true)
      expect(checkTimeOverlap('09:30', '11:00', '11:00', '13:00')).toBe(false)
    })
  })

  describe('checkWorkshopTimeConflict', () => {
    const createWorkshop = (
      id: string,
      date: string,
      startTime: string,
      endTime: string,
    ): ProposalWithWorkshopData => ({
      _id: id,
      _type: 'proposal',
      _createdAt: '2025-01-01',
      _updatedAt: '2025-01-01',
      _rev: 'v1',
      title: `Workshop ${id}`,
      description: [],
      outline: 'Workshop outline',
      tos: true,
      language: Language.english,
      level: Level.intermediate,
      audiences: [],
      topics: [],
      date,
      startTime,
      endTime,
      capacity: 20,
      signups: 0,
      available: 20,
      speakers: [],
      conference: {} as any,
      format: Format.workshop_120,
      status: Status.accepted,
    })

    it('detects conflict with overlapping workshop on same day', () => {
      const newWorkshop = createWorkshop('w1', '2025-11-15', '10:00', '12:00')
      const userWorkshops = [
        createWorkshop('w2', '2025-11-15', '11:00', '13:00'),
      ]

      const result = checkWorkshopTimeConflict(newWorkshop, userWorkshops)

      expect(result.hasConflict).toBe(true)
      expect(result.conflictingWorkshop).toBe(userWorkshops[0])
    })

    it('returns no conflict for workshops on different days', () => {
      const newWorkshop = createWorkshop('w1', '2025-11-15', '10:00', '12:00')
      const userWorkshops = [
        createWorkshop('w2', '2025-11-16', '10:00', '12:00'),
      ]

      const result = checkWorkshopTimeConflict(newWorkshop, userWorkshops)

      expect(result.hasConflict).toBe(false)
      expect(result.conflictingWorkshop).toBeNull()
    })

    it('returns no conflict for back-to-back workshops on same day', () => {
      const newWorkshop = createWorkshop('w1', '2025-11-15', '10:00', '12:00')
      const userWorkshops = [
        createWorkshop('w2', '2025-11-15', '12:00', '14:00'),
      ]

      const result = checkWorkshopTimeConflict(newWorkshop, userWorkshops)

      expect(result.hasConflict).toBe(false)
      expect(result.conflictingWorkshop).toBeNull()
    })

    it('ignores the workshop itself when checking conflicts', () => {
      const workshop = createWorkshop('w1', '2025-11-15', '10:00', '12:00')

      const result = checkWorkshopTimeConflict(workshop, [workshop])

      expect(result.hasConflict).toBe(false)
      expect(result.conflictingWorkshop).toBeNull()
    })

    it('returns no conflict when workshop has no date/time info', () => {
      const newWorkshop = {
        _id: 'w1',
        title: 'Workshop 1',
      } as ProposalWithWorkshopData
      const userWorkshops = [
        createWorkshop('w2', '2025-11-15', '10:00', '12:00'),
      ]

      const result = checkWorkshopTimeConflict(newWorkshop, userWorkshops)

      expect(result.hasConflict).toBe(false)
      expect(result.conflictingWorkshop).toBeNull()
    })

    it('ignores user workshops with incomplete date/time info', () => {
      const newWorkshop = createWorkshop('w1', '2025-11-15', '10:00', '12:00')
      const userWorkshops = [
        {
          _id: 'w2',
          title: 'Workshop 2',
          date: '2025-11-15',
        } as ProposalWithWorkshopData,
      ]

      const result = checkWorkshopTimeConflict(newWorkshop, userWorkshops)

      expect(result.hasConflict).toBe(false)
      expect(result.conflictingWorkshop).toBeNull()
    })

    it('checks multiple workshops and returns first conflict', () => {
      const newWorkshop = createWorkshop('w1', '2025-11-15', '10:00', '12:00')
      const userWorkshops = [
        createWorkshop('w2', '2025-11-15', '09:00', '10:00'),
        createWorkshop('w3', '2025-11-15', '11:00', '13:00'),
        createWorkshop('w4', '2025-11-15', '14:00', '16:00'),
      ]

      const result = checkWorkshopTimeConflict(newWorkshop, userWorkshops)

      expect(result.hasConflict).toBe(true)
      expect(result.conflictingWorkshop).toBe(userWorkshops[1])
    })

    it('works with scheduleInfo properties', () => {
      const newWorkshop = {
        _id: 'w1',
        scheduleInfo: {
          date: '2025-11-15',
          timeSlot: {
            startTime: '10:00',
            endTime: '12:00',
          },
        },
      } as ProposalWithWorkshopData

      const userWorkshops = [
        {
          _id: 'w2',
          scheduleInfo: {
            date: '2025-11-15',
            timeSlot: {
              startTime: '11:00',
              endTime: '13:00',
            },
          },
        } as ProposalWithWorkshopData,
      ]

      const result = checkWorkshopTimeConflict(newWorkshop, userWorkshops)

      expect(result.hasConflict).toBe(true)
      expect(result.conflictingWorkshop).toBe(userWorkshops[0])
    })
  })

  describe('getWorkshopIdFromSignup', () => {
    it('returns _ref when available', () => {
      const signup = {
        workshop: {
          _ref: 'ref123',
          _id: 'id456',
        },
      }

      expect(getWorkshopIdFromSignup(signup)).toBe('ref123')
    })

    it('returns _id when _ref is not available', () => {
      const signup = {
        workshop: {
          _id: 'id456',
        },
      }

      expect(getWorkshopIdFromSignup(signup)).toBe('id456')
    })

    it('returns empty string when workshop is missing', () => {
      const signup = {}

      expect(getWorkshopIdFromSignup(signup)).toBe('')
    })

    it('returns empty string when workshop properties are missing', () => {
      const signup = {
        workshop: {},
      }

      expect(getWorkshopIdFromSignup(signup)).toBe('')
    })
  })
})
