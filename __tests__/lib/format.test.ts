import { formatOrgNumber } from '@/lib/format'

const nbsp = '\u00A0'

describe('formatOrgNumber', () => {
  it('should format a raw 9-digit string with non-breaking spaces', () => {
    expect(formatOrgNumber('933338622')).toBe(`933${nbsp}338${nbsp}622`)
  })

  it('should reformat already-spaced numbers with non-breaking spaces', () => {
    expect(formatOrgNumber('933 338 622')).toBe(`933${nbsp}338${nbsp}622`)
  })

  it('should handle NO prefix', () => {
    expect(formatOrgNumber('NO933338622')).toBe(`NO 933${nbsp}338${nbsp}622`)
    expect(formatOrgNumber('NO 933338622')).toBe(`NO 933${nbsp}338${nbsp}622`)
  })

  it('should handle MVA suffix', () => {
    expect(formatOrgNumber('933338622MVA')).toBe(`933${nbsp}338${nbsp}622 MVA`)
    expect(formatOrgNumber('933338622 MVA')).toBe(`933${nbsp}338${nbsp}622 MVA`)
  })

  it('should handle NO prefix and MVA suffix together', () => {
    expect(formatOrgNumber('NO933338622MVA')).toBe(
      `NO 933${nbsp}338${nbsp}622 MVA`,
    )
    expect(formatOrgNumber('NO 933338622 MVA')).toBe(
      `NO 933${nbsp}338${nbsp}622 MVA`,
    )
    expect(formatOrgNumber('NO 933 338 622 MVA')).toBe(
      `NO 933${nbsp}338${nbsp}622 MVA`,
    )
  })

  it('should be case-insensitive for prefix/suffix', () => {
    expect(formatOrgNumber('no933338622mva')).toBe(
      `NO 933${nbsp}338${nbsp}622 MVA`,
    )
  })

  it('should return non-9-digit values unchanged', () => {
    expect(formatOrgNumber('12345678')).toBe('12345678')
    expect(formatOrgNumber('1234567890')).toBe('1234567890')
  })

  it('should return non-numeric values unchanged', () => {
    expect(formatOrgNumber('ABC123DEF')).toBe('ABC123DEF')
    expect(formatOrgNumber('not a number')).toBe('not a number')
  })

  it('should handle empty and whitespace strings', () => {
    expect(formatOrgNumber('')).toBe('')
    expect(formatOrgNumber('  ')).toBe('  ')
  })

  it('should trim surrounding whitespace', () => {
    expect(formatOrgNumber(' 933338622 ')).toBe(`933${nbsp}338${nbsp}622`)
  })
})
