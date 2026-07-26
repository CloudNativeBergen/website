/**
 * @vitest-environment jsdom
 */
import {
  formatDate,
  formatDateLocalized,
  formatDateSafe,
  formatDatesSafe,
  formatDateTimeSafe,
  formatConferenceDate,
  formatConferenceDateShort,
  formatConferenceDateLong,
  formatConferenceDateForBadge,
  formatChartMonth,
  formatChartDay,
  formatChartDateShort,
} from '@/lib/time'

describe('time.ts', () => {
  describe('formatDate', () => {
    it('should format a valid date string in the nb-NO house locale', () => {
      expect(formatDate('2025-10-27')).toBe('27. oktober 2025')
    })

    it('should return TBD for empty string', () => {
      expect(formatDate('')).toBe('TBD')
    })
  })

  describe('formatDateLocalized', () => {
    it('defaults to nb-NO', () => {
      expect(formatDateLocalized('2026-06-10')).toBe('10. juni 2026')
    })

    it('honours an explicit locale override (e.g. English contracts)', () => {
      expect(formatDateLocalized('2026-06-10', 'en-GB')).toBe('10 June 2026')
    })
  })

  describe('formatDateSafe', () => {
    it('should format a valid date string', () => {
      expect(formatDateSafe('2025-10-27')).toBe('27. okt. 2025')
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
      expect(formatDatesSafe('2025-10-27', '2025-10-28')).toBe(
        '27.–28. oktober 2025',
      )
    })

    it('should format a valid date range across months', () => {
      expect(formatDatesSafe('2025-10-27', '2025-11-05')).toBe(
        '27. oktober – 5. november 2025',
      )
    })

    it('should format a valid date range across years', () => {
      expect(formatDatesSafe('2025-12-27', '2026-01-05')).toBe(
        '27. desember 2025 – 5. januar 2026',
      )
    })

    it('should format a single date when both are equal', () => {
      expect(formatDatesSafe('2025-10-27', '2025-10-27')).toBe(
        '27. oktober 2025',
      )
    })

    it('should return TBD for empty inputs', () => {
      expect(formatDatesSafe('', '')).toBe('TBD')
    })

    it('should handle partial invalid input', () => {
      expect(formatDatesSafe('2025-10-27', '')).toBe('TBD')
    })
  })

  describe('formatDateTimeSafe', () => {
    it('should format a valid datetime string', () => {
      const result = formatDateTimeSafe('2025-10-27T14:30:00Z')
      expect(result).toMatch(/27\. oktober 2025 kl\. \d{2}:\d{2}/)
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
      expect(formatConferenceDate('2025-10-27')).toBe('mandag 27. oktober 2025')
    })

    it('should format date with custom options', () => {
      expect(
        formatConferenceDate('2025-10-27', {
          month: 'short',
          day: 'numeric',
        }),
      ).toBe('27. okt.')
    })

    it('should handle single-digit day and month', () => {
      expect(formatConferenceDate('2025-01-05')).toBe('søndag 5. januar 2025')
    })
  })

  describe('formatConferenceDateShort', () => {
    it('should format date in short format', () => {
      expect(formatConferenceDateShort('2025-10-27')).toBe('man. 27. okt.')
    })

    it('should handle different dates', () => {
      expect(formatConferenceDateShort('2025-10-28')).toBe('tir. 28. okt.')
      expect(formatConferenceDateShort('2025-12-25')).toBe('tor. 25. des.')
    })
  })

  describe('formatConferenceDateLong', () => {
    it('should format date in long format', () => {
      expect(formatConferenceDateLong('2025-10-27')).toBe(
        'mandag 27. oktober 2025',
      )
    })

    it('should handle different dates', () => {
      expect(formatConferenceDateLong('2025-10-28')).toBe(
        'tirsdag 28. oktober 2025',
      )
    })
  })

  describe('formatConferenceDateForBadge', () => {
    it('should format date for badge display (month and year only)', () => {
      expect(formatConferenceDateForBadge('2025-10-27')).toBe('oktober 2025')
    })

    it('should handle different months', () => {
      expect(formatConferenceDateForBadge('2025-01-15')).toBe('januar 2025')
      expect(formatConferenceDateForBadge('2025-12-25')).toBe('desember 2025')
    })

    it('should work across years', () => {
      expect(formatConferenceDateForBadge('2024-03-10')).toBe('mars 2024')
      expect(formatConferenceDateForBadge('2026-06-20')).toBe('juni 2026')
    })
  })

  describe('chart label helpers', () => {
    it('formatChartMonth returns the short month', () => {
      expect(formatChartMonth('2026-06-10')).toBe('jun')
      expect(formatChartMonth('2025-10-27')).toBe('okt')
    })

    it('formatChartDay returns a bare day number (no trailing period)', () => {
      expect(formatChartDay('2025-10-27')).toBe('27')
      expect(formatChartDay('2026-06-01')).toBe('1')
    })

    it('formatChartDateShort returns a compact single-line label', () => {
      expect(formatChartDateShort('2025-10-27')).toBe('27. okt.')
    })
  })

  /**
   * Timezone-stability regression tests for the UTC-noon anchoring fix.
   *
   * Node honours runtime changes to process.env.TZ for Date operations, so we
   * drive the helpers under extreme timezones east and west of Oslo. Before the
   * fix, conference dates were parsed at LOCAL midnight, so a viewer far east of
   * Oslo saw the PREVIOUS calendar day (and it hydration-mismatched). The
   * anchored implementation must render the same Oslo day everywhere.
   */
  describe('timezone stability (UTC-noon anchoring)', () => {
    const originalTZ = process.env.TZ

    afterEach(() => {
      process.env.TZ = originalTZ
    })

    const timezones = [
      'Pacific/Kiritimati', // UTC+14 (furthest east)
      'Pacific/Pago_Pago', // UTC-11 (furthest west)
      'UTC',
      'America/Los_Angeles',
      'Asia/Tokyo',
    ]

    it.each(timezones)(
      'renders conference dates on the correct Oslo day under %s',
      (tz) => {
        process.env.TZ = tz
        expect(formatConferenceDateLong('2025-10-27')).toBe(
          'mandag 27. oktober 2025',
        )
        expect(formatConferenceDateShort('2025-10-27')).toBe('man. 27. okt.')
        expect(formatConferenceDate('2025-10-27')).toBe(
          'mandag 27. oktober 2025',
        )
        expect(formatDate('2025-10-27')).toBe('27. oktober 2025')
        expect(formatDatesSafe('2025-10-27', '2025-10-28')).toBe(
          '27.–28. oktober 2025',
        )
        expect(formatConferenceDateForBadge('2025-10-27')).toBe('oktober 2025')
      },
    )

    it('demonstrates the legacy local-midnight parse WOULD shift the day east of Oslo', () => {
      process.env.TZ = 'Pacific/Kiritimati' // UTC+14
      // The old implementation: new Date(y, m-1, d) === local midnight.
      const legacy = new Date(2025, 9, 27).toLocaleDateString('en-US', {
        timeZone: 'Europe/Oslo',
        day: 'numeric',
      })
      // Local midnight in UTC+14 is the 26th at 10:00 in Oslo -> wrong day.
      expect(legacy).toBe('26')
      // The fixed helper stays on the 27th.
      expect(formatConferenceDate('2025-10-27', { day: 'numeric' })).toBe('27.')
    })
  })
})
