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

  it('is closed when Paused', () => {
    const now = at('2026-10-26T08:00:00Z')
    expect(isPostingOpen({ postingMode: 'paused' }, conference, now)).toBe(
      false,
    )
  })

  it('a missing mode is Automatic: closed without a start date to open on', () => {
    const now = at('2026-10-26T08:00:00Z')
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
    // A missing mode is Automatic; this conference has no start date.
    [{}, conference, now, 'noStartDate'],
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

describe('Automatic (§7, P2): open from the first day to the end of the last', () => {
  const auto = { postingMode: 'auto' as const }
  // CNDN 2026: Mon 26 to Tue 27 October, CET (+01:00).
  const cndn = { startDate: '2026-10-26', endDate: '2026-10-27' }

  it('is open during the conference', () => {
    expect(postingState(auto, cndn, at('2026-10-26T08:00:00Z'))).toBe('open')
  })

  it('opens at 00:00 Oslo on the first day, not a second before', () => {
    // 00:00 CET on the 26th is 23:00Z on the 25th.
    expect(postingState(auto, cndn, at('2026-10-25T22:59:59Z'))).toBe(
      'notYetOpen',
    )
    expect(postingState(auto, cndn, at('2026-10-25T23:00:00Z'))).toBe('open')
  })

  it('is open at the last instant of the last day and closed at the next Oslo midnight', () => {
    expect(postingState(auto, cndn, at('2026-10-27T22:59:59Z'))).toBe('open')
    expect(postingState(auto, cndn, at('2026-10-27T23:00:00Z'))).toBe('ended')
  })

  it('is open for the whole of a one-day conference', () => {
    const oneDay = { startDate: '2026-10-26', endDate: '2026-10-26' }
    expect(postingState(auto, oneDay, at('2026-10-25T22:59:59Z'))).toBe(
      'notYetOpen',
    )
    expect(postingState(auto, oneDay, at('2026-10-25T23:00:00Z'))).toBe('open')
    expect(postingState(auto, oneDay, at('2026-10-26T22:59:59Z'))).toBe('open')
    expect(postingState(auto, oneDay, at('2026-10-26T23:00:00Z'))).toBe('ended')
  })

  it('never opens when the end date is before the start date', () => {
    const backwards = { startDate: '2026-10-28', endDate: '2026-10-26' }
    for (const when of [
      '2026-10-25T12:00:00Z',
      '2026-10-26T22:59:59Z', // last instant of the "last" day
      '2026-10-26T23:00:00Z',
      '2026-10-27T23:00:00Z', // 00:00 on the "first" day
      '2026-10-28T12:00:00Z',
    ]) {
      expect(isPostingOpen(auto, backwards, at(when)), when).toBe(false)
    }
  })

  it('fails closed without a usable start date', () => {
    const now = at('2026-10-26T08:00:00Z')
    expect(postingState(auto, { endDate: '2026-10-27' }, now)).toBe(
      'noStartDate',
    )
    expect(
      postingState(
        auto,
        { startDate: '26.10.2026', endDate: '2026-10-27' },
        now,
      ),
    ).toBe('noStartDate')
    expect(
      postingState(
        auto,
        { startDate: '2026-02-30', endDate: '2026-10-27' },
        now,
      ),
    ).toBe('noStartDate')
  })

  it('fails closed without a usable end date, whatever the start date says', () => {
    expect(
      postingState(
        auto,
        { startDate: '2026-10-26' },
        at('2026-10-26T08:00:00Z'),
      ),
    ).toBe('noEndDate')
  })

  it('Open opens early and Paused pauses, both still closing after the last day', () => {
    const before = at('2026-10-20T12:00:00Z')
    expect(postingState({ postingMode: 'open' }, cndn, before)).toBe('open')
    expect(postingState({ postingMode: 'paused' }, cndn, before)).toBe('paused')
    const during = at('2026-10-26T08:00:00Z')
    expect(postingState({ postingMode: 'paused' }, cndn, during)).toBe('paused')
    const after = at('2026-10-27T23:00:00Z')
    expect(postingState({ postingMode: 'open' }, cndn, after)).toBe('ended')
    expect(postingState({ postingMode: 'paused' }, cndn, after)).toBe('paused')
  })

  it('a wall the retention cron closed is closed in every mode and at every time', () => {
    const closedAt = '2026-10-26T07:00:00Z'
    for (const mode of ['auto', 'open', 'paused'] as const) {
      for (const when of ['2026-10-20T12:00:00Z', '2026-10-26T08:00:00Z']) {
        expect(
          postingState({ postingMode: mode, closedAt }, cndn, at(when)),
          `${mode} at ${when}`,
        ).toBe('closed')
      }
    }
  })

  describe('across a DST change', () => {
    it('CNDN 2026 starts the day after the clocks go back: opens at 23:00Z', () => {
      // Sun 25 Oct 2026 03:00 CEST becomes 02:00 CET; Monday is CET.
      expect(postingState(auto, cndn, at('2026-10-25T22:59:59Z'))).toBe(
        'notYetOpen',
      )
      expect(postingState(auto, cndn, at('2026-10-25T23:00:00Z'))).toBe('open')
    })

    it('a conference spanning the autumn change opens at 22:00Z and closes at 23:00Z', () => {
      // Sat 24 Oct is CEST (+02:00), Mon 26 Oct is CET (+01:00).
      const spanning = { startDate: '2026-10-24', endDate: '2026-10-26' }
      expect(postingState(auto, spanning, at('2026-10-23T21:59:59Z'))).toBe(
        'notYetOpen',
      )
      expect(postingState(auto, spanning, at('2026-10-23T22:00:00Z'))).toBe(
        'open',
      )
      // The 25th is 25 hours long; still open through it.
      expect(postingState(auto, spanning, at('2026-10-25T01:30:00Z'))).toBe(
        'open',
      )
      expect(postingState(auto, spanning, at('2026-10-26T22:59:59Z'))).toBe(
        'open',
      )
      expect(postingState(auto, spanning, at('2026-10-26T23:00:00Z'))).toBe(
        'ended',
      )
    })

    it('a conference spanning the spring change opens at 23:00Z and closes at 22:00Z', () => {
      // Sat 28 Mar 2026 is CET; 02:00 becomes 03:00 CEST on the 29th.
      const spanning = { startDate: '2026-03-28', endDate: '2026-03-30' }
      expect(postingState(auto, spanning, at('2026-03-27T22:59:59Z'))).toBe(
        'notYetOpen',
      )
      expect(postingState(auto, spanning, at('2026-03-27T23:00:00Z'))).toBe(
        'open',
      )
      expect(postingState(auto, spanning, at('2026-03-30T21:59:59Z'))).toBe(
        'open',
      )
      expect(postingState(auto, spanning, at('2026-03-30T22:00:00Z'))).toBe(
        'ended',
      )
    })

    it('a conference starting the day after the spring change opens at 22:00Z', () => {
      const c = { startDate: '2026-03-30', endDate: '2026-03-30' }
      expect(postingState(auto, c, at('2026-03-29T21:59:59Z'))).toBe(
        'notYetOpen',
      )
      expect(postingState(auto, c, at('2026-03-29T22:00:00Z'))).toBe('open')
    })
  })
})
