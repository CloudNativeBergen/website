/**
 * @vitest-environment jsdom
 */
import {
  formatDate,
  formatDateLocalized,
  formatDateSafe,
  formatDatesSafe,
  formatDateRangeLocalized,
  formatDateTimeSafe,
  formatConferenceDate,
  formatConferenceDateShort,
  formatConferenceDateLong,
  formatConferenceDateForBadge,
  formatChartMonth,
  formatChartDay,
  formatChartDateShort,
  instantToOsloLocalInput,
  osloLocalInputToIso,
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

describe('instantToOsloLocalInput / osloLocalInputToIso', () => {
  it('round-trips an instant through Oslo wall-clock (CET, UTC+1)', () => {
    // 10:00Z in January = 11:00 Oslo (CET)
    expect(instantToOsloLocalInput('2026-01-15T10:00:00.000Z')).toBe(
      '2026-01-15T11:00',
    )
    expect(osloLocalInputToIso('2026-01-15T11:00')).toBe(
      '2026-01-15T10:00:00.000Z',
    )
  })

  it('is DST-correct in summer (CEST, UTC+2)', () => {
    expect(instantToOsloLocalInput('2026-07-15T10:00:00.000Z')).toBe(
      '2026-07-15T12:00',
    )
    expect(osloLocalInputToIso('2026-07-15T12:00')).toBe(
      '2026-07-15T10:00:00.000Z',
    )
  })

  it('resolves DST transition edge cases to a consistent instant', () => {
    // Spring forward 2026: 02:00→03:00 Oslo on Mar 29; 02:30 does not exist as
    // a wall-clock time. Best-effort resolution maps it to a real instant
    // inside the transition hour (documented behavior, pinned here).
    const spring = osloLocalInputToIso('2026-03-29T02:30')
    expect(spring).toBe('2026-03-29T01:30:00.000Z')
    // Fall back 2026: 03:00→02:00 on Oct 25; 02:30 occurs twice. The helper
    // resolves deterministically to one of the two instants (CET, post-switch).
    const fall = osloLocalInputToIso('2026-10-25T02:30')
    expect(fall).toBe('2026-10-25T01:30:00.000Z')
    // Both round-trip back to a 02:30 Oslo wall-clock display.
    expect(instantToOsloLocalInput(fall!)).toBe('2026-10-25T02:30')
  })

  it('degrades malformed values instead of throwing', () => {
    expect(instantToOsloLocalInput('nope')).toBe('')
    expect(instantToOsloLocalInput(undefined)).toBe('')
    expect(osloLocalInputToIso('not-a-date')).toBeNull()
    expect(osloLocalInputToIso('')).toBeNull()
  })
})

describe('formatDateRangeLocalized', () => {
  it('collapses the range the way the locale does', () => {
    expect(
      formatDateRangeLocalized('2026-11-05', '2026-11-06', 'en-GB'),
    ).toMatch(/5\s*[–-]\s*6 November 2026/)
  })

  it('spans months and years without losing either end', () => {
    expect(
      formatDateRangeLocalized('2026-10-30', '2026-11-02', 'en-GB'),
    ).toContain('October')
    expect(
      formatDateRangeLocalized('2026-12-30', '2027-01-02', 'en-GB'),
    ).toContain('2027')
  })

  it('renders a single day when both ends match', () => {
    expect(formatDateRangeLocalized('2026-11-05', '2026-11-05', 'en-GB')).toBe(
      '5 November 2026',
    )
  })

  it('defaults to the house locale', () => {
    expect(formatDateRangeLocalized('2026-11-05', '2026-11-06')).toContain(
      'november',
    )
  })

  it('reads forward even when the ends are stored the wrong way round', () => {
    expect(
      formatDateRangeLocalized('2026-11-06', '2026-11-05', 'en-GB'),
    ).toMatch(/5\s*[–-]\s*6 November 2026/)
  })

  it('handles missing and invalid input', () => {
    expect(formatDateRangeLocalized('', '2026-11-06')).toBe('TBD')
    expect(formatDateRangeLocalized('nonsense', 'also-nonsense')).toBe(
      'Invalid Date Range',
    )
  })
})
