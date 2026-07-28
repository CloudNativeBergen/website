import { describe, it, expect } from 'vitest'
import { normalizeEmail, uniqueEmails } from './email'

describe('normalizeEmail — identity canonicalization (#684)', () => {
  it('folds case so two provider casings of one mailbox collapse', () => {
    expect(normalizeEmail('Hans@Example.com')).toBe('hans@example.com')
    expect(normalizeEmail('HANS@EXAMPLE.COM')).toBe(
      normalizeEmail('hans@example.com'),
    )
  })

  it('strips surrounding whitespace', () => {
    expect(normalizeEmail('  hans@example.com\n')).toBe('hans@example.com')
    expect(normalizeEmail('\thans@example.com ')).toBe(
      normalizeEmail('hans@example.com'),
    )
  })

  it('applies NFKC so compatibility codepoints canonicalize', () => {
    // Fullwidth latin small letters + U+FF20 FULLWIDTH COMMERCIAL AT.
    const fullwidth = 'ｈａｎｓ＠ex.com'
    expect(normalizeEmail(fullwidth)).toBe('hans@ex.com')
    // U+FB00 LATIN SMALL LIGATURE FF folds to "ff".
    expect(normalizeEmail('oﬀice@ex.com')).toBe('office@ex.com')
  })

  it('is idempotent', () => {
    const once = normalizeEmail('  Hans@Example.com ')
    expect(normalizeEmail(once)).toBe(once)
  })

  it('keeps genuinely different addresses different', () => {
    expect(normalizeEmail('hans@example.com')).not.toBe(
      normalizeEmail('hans@example.org'),
    )
    expect(normalizeEmail('hans@example.com')).not.toBe(
      normalizeEmail('hans.k@example.com'),
    )
    expect(normalizeEmail('hans+cfp@example.com')).not.toBe(
      normalizeEmail('hans@example.com'),
    )
  })

  it('maps absent values to the empty string', () => {
    expect(normalizeEmail(undefined)).toBe('')
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail('   ')).toBe('')
  })
})

describe('uniqueEmails', () => {
  it('dedupes across casing and whitespace, preserving first-seen order', () => {
    expect(
      uniqueEmails([
        ' Hans@Example.com ',
        'hans@example.com',
        'other@example.com',
        'HANS@EXAMPLE.COM',
      ]),
    ).toEqual(['hans@example.com', 'other@example.com'])
  })

  it('drops empty and absent entries', () => {
    expect(uniqueEmails([null, undefined, '', '  ', 'a@b.com'])).toEqual([
      'a@b.com',
    ])
  })
})
