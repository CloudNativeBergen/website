import { describe, it, expect } from 'vitest'
import { csvCell, csvRow, csvDocument, csvFilename } from './csv'

describe('csvCell', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('Acme AS')).toBe('Acme AS')
    expect(csvCell(50000)).toBe('50000')
  })

  it('quotes separators and escapes embedded quotes', () => {
    expect(csvCell('Split, 50/50')).toBe('"Split, 50/50"')
    expect(csvCell('Acme "Cloud" AS')).toBe('"Acme ""Cloud"" AS"')
    expect(csvCell('a;b')).toBe('"a;b"')
  })

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toContain("'=HYPERLINK")
    expect(csvCell('+1 555')).toBe("'+1 555")
    expect(csvCell('@handle')).toBe("'@handle")
  })

  it('flattens newlines and renders nullish as empty', () => {
    expect(csvCell('line one\nline two')).toBe('line one line two')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(null)).toBe('')
  })
})

describe('csvDocument', () => {
  it('escapes the header row with the same rules as data rows', () => {
    const csv = csvDocument(['Amount, ex VAT', 'Sponsor'], [[1, 'Acme']])

    expect(csv.split('\n')[0]).toContain('"Amount, ex VAT"')
  })

  it('starts with a UTF-8 BOM and ends with a newline', () => {
    const csv = csvDocument(['A'], [['x']])

    expect(csv).toMatch(/^﻿/)
    expect(csv.endsWith('\n')).toBe(true)
  })

  it('writes a header-only document when there are no rows', () => {
    expect(csvDocument(['A', 'B'], []).trimEnd()).toBe('﻿A,B')
  })
})

describe('csvRow', () => {
  it('joins escaped cells with commas', () => {
    expect(csvRow(['a', 'b,c', undefined])).toBe('a,"b,c",')
  })
})

describe('csvFilename', () => {
  it('slugifies the context onto the prefix', () => {
    expect(csvFilename('sponsor-invoices', 'Cloud Native Days 2026')).toBe(
      'sponsor-invoices-cloud-native-days-2026.csv',
    )
  })

  it('falls back to the bare prefix when nothing survives slugification', () => {
    expect(csvFilename('sponsor-invoices', '—')).toBe('sponsor-invoices.csv')
  })
})

describe('csvCell control characters', () => {
  it('strips a bare carriage return, not just CRLF', () => {
    expect(csvCell('line one\rline two')).toBe('line one line two')
    expect(csvCell('a\r\nb\nc\rd')).toBe('a b c d')
  })
})
