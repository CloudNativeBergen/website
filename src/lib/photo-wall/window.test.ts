import { describe, expect, it } from 'vitest'
import { isPostingOpen, postingState } from './window'

const at = (iso: string) => new Date(iso)
const open = { postingMode: 'open' as const }
const conference = { endDate: '2026-10-27' }

describe('isPostingOpen (Photo Wall spec §7)', () => {
  it('is open while the switch says Open, up to the end of the last day', () => {
    // 2026-10-27 is CET (+01:00): 23:59:59 Oslo is 22:59:59Z.
    expect(isPostingOpen(open, conference, at('2026-10-26T08:00:00Z'))).toBe(
      true,
    )
    expect(isPostingOpen(open, conference, at('2026-10-27T22:59:59Z'))).toBe(
      true,
    )
  })

  it('closes at midnight Oslo after the last day, even when Open', () => {
    expect(isPostingOpen(open, conference, at('2026-10-27T23:00:00Z'))).toBe(
      false,
    )
    expect(isPostingOpen(open, conference, at('2026-11-20T12:00:00Z'))).toBe(
      false,
    )
  })

  it('is closed when Paused, and when the mode is missing', () => {
    const now = at('2026-10-26T08:00:00Z')
    expect(isPostingOpen({ postingMode: 'paused' }, conference, now)).toBe(
      false,
    )
    expect(isPostingOpen({}, conference, now)).toBe(false)
    expect(isPostingOpen({ postingMode: null }, conference, now)).toBe(false)
  })

  it('is closed for a wall the retention cron closed (§11.1)', () => {
    expect(
      isPostingOpen(
        { postingMode: 'open', closedAt: '2026-10-26T07:00:00Z' },
        conference,
        at('2026-10-26T08:00:00Z'),
      ),
    ).toBe(false)
  })

  it('is closed when the conference has no usable end date', () => {
    const now = at('2026-10-26T08:00:00Z')
    expect(isPostingOpen(open, {}, now)).toBe(false)
    expect(isPostingOpen(open, { endDate: '27.10.2026' }, now)).toBe(false)
  })

  describe('across a DST change', () => {
    it('the last day in summer time ends at 22:00Z', () => {
      // 2026-10-24 is CEST (+02:00); the clocks go back on the 25th at 03:00.
      const c = { endDate: '2026-10-24' }
      expect(isPostingOpen(open, c, at('2026-10-24T21:59:59Z'))).toBe(true)
      expect(isPostingOpen(open, c, at('2026-10-24T22:00:00Z'))).toBe(false)
    })

    it('the day the clocks go back (25 hours long) ends at 23:00Z', () => {
      const c = { endDate: '2026-10-25' }
      expect(isPostingOpen(open, c, at('2026-10-25T22:59:59Z'))).toBe(true)
      expect(isPostingOpen(open, c, at('2026-10-25T23:00:00Z'))).toBe(false)
    })

    it('the day the clocks go forward (23 hours long) ends at 22:00Z', () => {
      // 2026-03-29: 02:00 CET becomes 03:00 CEST.
      const c = { endDate: '2026-03-29' }
      expect(isPostingOpen(open, c, at('2026-03-29T21:59:59Z'))).toBe(true)
      expect(isPostingOpen(open, c, at('2026-03-29T22:00:00Z'))).toBe(false)
    })
  })
})

describe('postingState: why posting is not open (§7)', () => {
  const now = at('2026-10-26T08:00:00Z')
  it.each([
    [{ postingMode: 'open' as const }, conference, now, 'open'],
    [{ postingMode: 'paused' as const }, conference, now, 'paused'],
    [{}, conference, now, 'paused'],
    [open, conference, at('2026-10-27T23:00:00Z'), 'ended'],
    [open, {}, now, 'noEndDate'],
    [
      { postingMode: 'open' as const, closedAt: '2026-10-26T07:00:00Z' },
      conference,
      now,
      'closed',
    ],
    // Paused wins over the reasons: the organizer chose it.
    [{ postingMode: 'paused' as const }, {}, now, 'paused'],
  ])('%o on %o at %s is %s', (wall, c, when, expected) => {
    expect(postingState(wall, c, when)).toBe(expected)
  })
})
