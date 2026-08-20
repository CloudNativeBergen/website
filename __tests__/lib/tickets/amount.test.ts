import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseTicketAmount,
  parseVatPercent,
  resetAmountIssueReporting,
} from '@/lib/tickets/amount'

/**
 * The NaN policy, pinned (#898). Every assertion here is about a VALUE or about
 * a warning that was actually emitted — none of them pass because something is
 * absent.
 */
describe('parseTicketAmount', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetAmountIssueReporting()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  describe('values the providers actually send', () => {
    it.each([
      ['15000.00', 15000],
      ['99.99', 99.99],
      ['150.50', 150.5],
      ['0', 0],
      ['0.00', 0],
      ['-250.00', -250],
      ['25', 25],
      ['.5', 0.5],
    ])('parses %s as %s without complaining', (input, expected) => {
      expect(parseTicketAmount(input)).toBe(expected)
      expect(warn).not.toHaveBeenCalled()
    })

    it('tolerates surrounding whitespace', () => {
      expect(parseTicketAmount('  150.50  ')).toBe(150.5)
      expect(warn).not.toHaveBeenCalled()
    })

    it('passes a finite number straight through', () => {
      expect(parseTicketAmount(1234.5)).toBe(1234.5)
      expect(warn).not.toHaveBeenCalled()
    })
  })

  describe('absent is 0, and absence is not a failure', () => {
    it.each([[null], [undefined], [''], ['   ']])(
      'maps %p to 0 silently',
      (input) => {
        expect(parseTicketAmount(input as string | null | undefined)).toBe(0)
        expect(warn).not.toHaveBeenCalled()
      },
    )
  })

  describe('unparseable is 0, and is REPORTED', () => {
    it.each([['not-a-number'], ['abc'], ['NOK'], ['NaN'], ['--12']])(
      'maps %p to 0 and warns',
      (input) => {
        expect(parseTicketAmount(input)).toBe(0)
        expect(warn).toHaveBeenCalledTimes(1)
        expect(String(warn.mock.calls[0][0])).toContain(
          'unparseable amount treated as 0',
        )
      },
    )

    it('treats Infinity as unparseable — it poisons a total exactly as NaN does', () => {
      expect(parseTicketAmount('Infinity')).toBe(0)
      expect(parseTicketAmount('-Infinity')).toBe(0)
      expect(warn).toHaveBeenCalled()
    })

    it('rejects a non-finite number input', () => {
      expect(parseTicketAmount(NaN)).toBe(0)
      expect(parseTicketAmount(Infinity)).toBe(0)
      expect(warn).toHaveBeenCalledTimes(2)
    })

    it('rejects a value the types say cannot happen', () => {
      expect(parseTicketAmount({} as unknown as string)).toBe(0)
      expect(parseTicketAmount([] as unknown as string)).toBe(0)
      expect(warn).toHaveBeenCalled()
      expect(String(warn.mock.calls[0][0])).toContain('non-string amount')
    })
  })

  describe('NaN never escapes', () => {
    it('always returns a finite number, whatever it is handed', () => {
      const hostile: unknown[] = [
        'x',
        '',
        null,
        undefined,
        NaN,
        Infinity,
        -Infinity,
        {},
        [],
        '1e400',
        '0x10',
        'e5',
        '.',
        '-',
      ]
      for (const value of hostile) {
        const result = parseTicketAmount(value as string)
        expect(Number.isFinite(result)).toBe(true)
      }
    })

    it('keeps a total finite when one row is malformed — the processor bug', () => {
      const sums = ['5000.00', 'not-a-number', '2500.00']
      const total = sums.reduce((acc, s) => acc + parseTicketAmount(s), 0)
      expect(total).toBe(7500)
      // The bare parseFloat this replaced produced NaN for the whole total.
      expect(sums.reduce((acc, s) => acc + parseFloat(s), 0)).toBeNaN()
    })
  })

  describe('the dot-decimal assumption is monitored, not silently fixed', () => {
    it('keeps the parseFloat value of a comma decimal but reports it', () => {
      // Behaviour is UNCHANGED (#896 checked this: providers send dot
      // decimals). What is new is that we would now hear about it.
      expect(parseTicketAmount('1,5')).toBe(1)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toContain('partially parsed amount')
    })

    it('reports a trailing currency suffix', () => {
      expect(parseTicketAmount('1200 NOK')).toBe(1200)
      expect(String(warn.mock.calls[0][0])).toContain('partially parsed amount')
    })
  })

  describe('reporting does not flood the log', () => {
    it('warns once per distinct bad value, not once per ticket', () => {
      for (let i = 0; i < 500; i++) parseTicketAmount('not-a-number')
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('stops reporting after the cap, so provider data cannot fill the log', () => {
      for (let i = 0; i < 200; i++) parseTicketAmount(`bad-${i}`)
      expect(warn.mock.calls.length).toBeLessThanOrEqual(20)
      expect(warn.mock.calls.length).toBeGreaterThan(0)
    })

    it('still returns 0 for a value it has stopped reporting', () => {
      for (let i = 0; i < 200; i++) parseTicketAmount(`bad-${i}`)
      expect(parseTicketAmount('bad-999')).toBe(0)
    })
  })

  describe('the report budget decays instead of latching off', () => {
    it('reports again in a new window, so a long-lived process keeps its signal', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-08-15T10:00:00Z'))
        resetAmountIssueReporting()
        for (let i = 0; i < 200; i++) parseTicketAmount(`bad-${i}`)
        const spent = warn.mock.calls.length
        expect(spent).toBe(20)

        // Same process, same values, still inside the window: silent.
        parseTicketAmount('bad-500')
        expect(warn.mock.calls.length).toBe(spent)

        // An hour later the budget is back.
        vi.setSystemTime(new Date('2026-08-15T11:00:01Z'))
        parseTicketAmount('bad-500')
        expect(warn.mock.calls.length).toBe(spent + 1)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

/**
 * A VAT RATE is not a ticket sum: a missing sum is an ordinary fact (a free
 * ticket), a missing rate applied to an "incl. VAT" price is a silently
 * under-stated price.
 */
describe('parseVatPercent', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetAmountIssueReporting()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('parses an ordinary rate without complaining', () => {
    expect(parseVatPercent('25')).toBe(25)
    expect(parseVatPercent('12.5')).toBe(12.5)
    expect(warn).not.toHaveBeenCalled()
  })

  it('reports an ABSENT rate instead of coalescing it silently', () => {
    for (const absent of ['', '   ', null, undefined]) {
      resetAmountIssueReporting()
      warn.mockClear()
      expect(parseVatPercent(absent as string | null | undefined)).toBe(0)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toContain('missing VAT rate')
    }
  })

  it('reports an unparseable rate, like any other amount', () => {
    expect(parseVatPercent('not-a-number')).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('never returns NaN', () => {
    for (const value of ['', 'x', null, undefined, NaN, Infinity]) {
      expect(Number.isFinite(parseVatPercent(value as string | number))).toBe(
        true,
      )
    }
  })
})
