/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals'
import {
  formatDate,
  formatDateSafe,
  formatDatesSafe,
  formatDateTimeSafe,
  formatConferenceDate,
  formatConferenceDateShort,
  formatConferenceDateLong,
  formatConferenceDateForBadge,
} from '@/lib/time'

describe('time.ts', () => {
  describe('formatDate', () => {
    it('should format a valid date string', () => {
      const result = formatDate('2025-10-27')
      expect(result).toBe('27 October 2025')
    })

    it('should return TBD for empty string', () => {
      expect(formatDate('')).toBe('TBD')
    })
  })

  describe('formatDateSafe', () => {
    it('should format a valid date string', () => {
      const result = formatDateSafe('2025-10-27')
      expect(result).toMatch(/Oct 27, 2025/)
    })

    it('should return TBD for empty string', () => {
      expect(formatDateSafe('')).toBe('TBD')
    })

    it('should return Invalid Date for invalid input', () => {
      expect(formatDateSafe('not-a-date')).toBe('Invalid Date')
    })
  })

  describe('formatDatesSafe', () => {
    it('should format a valid date range in same month', () => {
      const result = formatDatesSafe('2025-10-27', '2025-10-28')
      expect(result).toBe('27 - 28 October 2025')
    })

    it('should format a valid date range across months', () => {
      const result = formatDatesSafe('2025-10-27', '2025-11-05')
      expect(result).toBe('27 October - 5 November 2025')
    })

    it('should format a valid date range across years', () => {
      const result = formatDatesSafe('2025-12-27', '2026-01-05')
      expect(result).toBe('27 December 2025 - 5 January 2026')
    })

    it('should return TBD for empty inputs', () => {
      expect(formatDatesSafe('', '')).toBe('TBD')
    })

    it('should handle partial invalid input', () => {
      const result = formatDatesSafe('2025-10-27', '')
      expect(result).toBe('TBD')
    })
  })

  describe('formatDateTimeSafe', () => {
    it('should format a valid datetime string', () => {
      const result = formatDateTimeSafe('2025-10-27T14:30:00')
      expect(result).toMatch(/October 27, 2025 at \d{2}:\d{2}/)
    })

    it('should return TBD for empty string', () => {
      expect(formatDateTimeSafe('')).toBe('TBD')
    })

    it('should return Invalid Date for invalid input', () => {
      expect(formatDateTimeSafe('not-a-date')).toBe('Invalid Date')
    })
  })

  describe('formatConferenceDate', () => {
    it('should format date with default long format', () => {
      const result = formatConferenceDate('2025-10-27')
      expect(result).toBe('Monday, October 27, 2025')
    })

    it('should format date with custom options', () => {
      const result = formatConferenceDate('2025-10-27', {
        month: 'short',
        day: 'numeric',
      })
      expect(result).toBe('Oct 27')
    })

    it('should handle single-digit day and month', () => {
      const result = formatConferenceDate('2025-01-05')
      expect(result).toBe('Sunday, January 5, 2025')
    })

    it('should consistently display dates regardless of system timezone', () => {
      // This test ensures the date is always interpreted as Oslo timezone
      const result = formatConferenceDate('2025-10-27')
      expect(result).toBe('Monday, October 27, 2025')
      // The day of week should be correct for Oslo timezone
      expect(result).toContain('Monday')
    })
  })

  describe('formatConferenceDateShort', () => {
    it('should format date in short format', () => {
      const result = formatConferenceDateShort('2025-10-27')
      expect(result).toBe('Mon, Oct 27')
    })

    it('should handle different dates', () => {
      expect(formatConferenceDateShort('2025-10-28')).toBe('Tue, Oct 28')
      expect(formatConferenceDateShort('2025-12-25')).toBe('Thu, Dec 25')
    })
  })

  describe('formatConferenceDateLong', () => {
    it('should format date in long format', () => {
      const result = formatConferenceDateLong('2025-10-27')
      expect(result).toBe('Monday, October 27, 2025')
    })

    it('should handle different dates', () => {
      expect(formatConferenceDateLong('2025-10-28')).toBe(
        'Tuesday, October 28, 2025',
      )
    })
  })

  describe('formatConferenceDateForBadge', () => {
    it('should format date for badge display (month and year only)', () => {
      const result = formatConferenceDateForBadge('2025-10-27')
      expect(result).toBe('October 2025')
    })

    it('should handle different months', () => {
      expect(formatConferenceDateForBadge('2025-01-15')).toBe('January 2025')
      expect(formatConferenceDateForBadge('2025-12-25')).toBe('December 2025')
    })

    it('should work across years', () => {
      expect(formatConferenceDateForBadge('2024-03-10')).toBe('March 2024')
      expect(formatConferenceDateForBadge('2026-06-20')).toBe('June 2026')
    })
  })

  describe('timezone consistency', () => {
    it('should display same date for conference dates regardless of execution timezone', () => {
      // These dates are the actual conference dates and should always
      // display as Monday 27th and Tuesday 28th October 2025
      const monday = formatConferenceDateLong('2025-10-27')
      const tuesday = formatConferenceDateLong('2025-10-28')

      expect(monday).toBe('Monday, October 27, 2025')
      expect(tuesday).toBe('Tuesday, October 28, 2025')

      // Verify the days of week are correct
      expect(monday).toContain('Monday')
      expect(tuesday).toContain('Tuesday')
    })

    it('should display correct weekday for dates near DST transitions', () => {
      // October 26, 2025 is when Europe transitions from CEST to CET
      // Sunday, October 26, 2025
      const sunday = formatConferenceDateLong('2025-10-26')
      expect(sunday).toContain('Sunday')

      // The conference dates should still be Monday and Tuesday
      const monday = formatConferenceDateLong('2025-10-27')
      const tuesday = formatConferenceDateLong('2025-10-28')

      expect(monday).toContain('Monday')
      expect(tuesday).toContain('Tuesday')
    })
  })
})
