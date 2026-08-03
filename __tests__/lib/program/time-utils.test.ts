import { isScheduleInPast, isScheduleToday } from '@/lib/program/time-utils'

describe('program/time-utils.ts', () => {
  describe('isScheduleInPast', () => {
    it('should return true for dates in the past', () => {
      const currentTime = new Date('2025-10-28T12:00:00')
      const scheduleDate = '2025-10-27'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(true)
    })

    it('should return false for today', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2025-10-27'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(false)
    })

    it('should return false for dates in the future', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2025-10-28'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(false)
    })

    it('should handle dates far in the past', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2024-01-01'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(true)
    })

    it('should handle dates far in the future', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2026-12-31'
      expect(isScheduleInPast(scheduleDate, currentTime)).toBe(false)
    })

    it('should ignore time of day (only compare dates)', () => {
      // Morning
      const morningTime = new Date('2025-10-28T08:00:00')
      expect(isScheduleInPast('2025-10-27', morningTime)).toBe(true)

      // Evening
      const eveningTime = new Date('2025-10-28T23:59:59')
      expect(isScheduleInPast('2025-10-27', eveningTime)).toBe(true)

      // Today should still be false regardless of time
      expect(isScheduleInPast('2025-10-28', morningTime)).toBe(false)
      expect(isScheduleInPast('2025-10-28', eveningTime)).toBe(false)
    })
  })

  describe('isScheduleToday', () => {
    it('should return true when schedule date matches current date', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2025-10-27'
      expect(isScheduleToday(scheduleDate, currentTime)).toBe(true)
    })

    it('should return false when schedule date is in the past', () => {
      const currentTime = new Date('2025-10-28T12:00:00')
      const scheduleDate = '2025-10-27'
      expect(isScheduleToday(scheduleDate, currentTime)).toBe(false)
    })

    it('should return false when schedule date is in the future', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const scheduleDate = '2025-10-28'
      expect(isScheduleToday(scheduleDate, currentTime)).toBe(false)
    })
  })

  describe('integration: isScheduleInPast and isScheduleToday', () => {
    it('should have mutually exclusive results for past and today', () => {
      const currentTime = new Date('2025-10-27T12:00:00')
      const yesterdayDate = '2025-10-26'
      const todayDate = '2025-10-27'
      const tomorrowDate = '2025-10-28'

      // Yesterday
      expect(isScheduleInPast(yesterdayDate, currentTime)).toBe(true)
      expect(isScheduleToday(yesterdayDate, currentTime)).toBe(false)

      // Today
      expect(isScheduleInPast(todayDate, currentTime)).toBe(false)
      expect(isScheduleToday(todayDate, currentTime)).toBe(true)

      // Tomorrow
      expect(isScheduleInPast(tomorrowDate, currentTime)).toBe(false)
      expect(isScheduleToday(tomorrowDate, currentTime)).toBe(false)
    })
  })
})

/**
 * Regression: a schedule date is a `YYYY-MM-DD` string, which `new Date()`
 * parses as UTC midnight. For any viewer west of UTC that is the PREVIOUS local
 * day, so day comparisons were off by one — a São Paulo conference's
 * "happening now" rail never activated on the actual conference day.
 *
 * These pin the viewer's timezone rather than trusting the machine's.
 */
describe('program/time-utils.ts — viewer timezone', () => {
  const withTimeZone = (tz: string, run: () => void) => {
    const original = process.env.TZ
    process.env.TZ = tz
    try {
      run()
    } finally {
      process.env.TZ = original
    }
  }

  it('treats the conference day as today for a viewer west of UTC', () => {
    withTimeZone('America/Sao_Paulo', () => {
      // 10:00 local on the conference day itself.
      const currentTime = new Date(2026, 10, 5, 10, 0, 0)
      expect(isScheduleToday('2026-11-05', currentTime)).toBe(true)
      expect(isScheduleInPast('2026-11-05', currentTime)).toBe(false)
    })
  })

  it('still treats it as today east of UTC', () => {
    withTimeZone('Europe/Oslo', () => {
      const currentTime = new Date(2026, 10, 5, 10, 0, 0)
      expect(isScheduleToday('2026-11-05', currentTime)).toBe(true)
    })
  })

  it('does not swallow a genuinely past day west of UTC', () => {
    withTimeZone('America/Sao_Paulo', () => {
      const currentTime = new Date(2026, 10, 6, 10, 0, 0)
      expect(isScheduleToday('2026-11-05', currentTime)).toBe(false)
      expect(isScheduleInPast('2026-11-05', currentTime)).toBe(true)
    })
  })
})
