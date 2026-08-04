import { describe, expect, it } from 'vitest'
import {
  isSafeLinkHref,
  isSafeRichTextHref,
  toSafeRichTextHref,
  UNSAFE_LINK_MESSAGE,
  UNSAFE_RICH_TEXT_LINK_MESSAGE,
} from './safeHref'

/** Schemes that must never survive either gate, on any surface. */
const HOSTILE = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html;base64,PHN2Zz48L3N2Zz4=',
  'vbscript:msgbox(1)',
  'blob:https://example.com/x',
  'file:///etc/passwd',
  '//evil.example',
  'https:evil.example',
  'https://',
  '',
  '   ',
]

describe('isSafeLinkHref — the CTA/button gate', () => {
  it.each([
    '/tickets',
    '/',
    '/a/b?c=d#e',
    'https://example.com/x',
    'HTTP://example.com',
  ])('accepts %j', (href) => expect(isSafeLinkHref(href)).toBe(true))

  it.each(HOSTILE)('rejects %j', (href) =>
    expect(isSafeLinkHref(href)).toBe(false),
  )

  it('rejects mailto: — a button is not an email link', () => {
    expect(isSafeLinkHref('mailto:hi@example.com')).toBe(false)
  })

  it.each([null, undefined, 42, {}, ['/tickets']])(
    'rejects the non-string %j',
    (value) => expect(isSafeLinkHref(value)).toBe(false),
  )
})

describe('isSafeRichTextHref — the prose gate', () => {
  it.each(['/tickets', 'https://example.com/x', 'mailto:hi@example.com'])(
    'accepts %j',
    (href) => expect(isSafeRichTextHref(href)).toBe(true),
  )

  it.each(HOSTILE)('rejects %j', (href) =>
    expect(isSafeRichTextHref(href)).toBe(false),
  )

  it('is a strict superset of the CTA gate', () => {
    for (const href of ['/tickets', 'https://example.com/x', ...HOSTILE]) {
      if (isSafeLinkHref(href)) expect(isSafeRichTextHref(href)).toBe(true)
    }
  })
})

describe('toSafeRichTextHref', () => {
  it('trims an accepted href', () => {
    expect(toSafeRichTextHref('  https://example.com/x  ')).toBe(
      'https://example.com/x',
    )
  })

  it('degrades a rejected href to an inert anchor rather than throwing', () => {
    expect(toSafeRichTextHref('javascript:alert(1)')).toBe('#')
    expect(toSafeRichTextHref(undefined)).toBe('#')
  })
})

// The two messages exist because the two predicates admit different schemes.
// Collapsing them back into one constant would tell an organizer whose valid
// `mailto:` link was rejected about a rule that was never applied to it.
describe('rejection messages describe the rule that was applied', () => {
  it('keeps the CTA message silent about mailto:', () => {
    expect(UNSAFE_LINK_MESSAGE).not.toMatch(/mailto/i)
  })

  it('names mailto: in the rich-text message', () => {
    expect(UNSAFE_RICH_TEXT_LINK_MESSAGE).toMatch(/mailto/i)
  })

  it('keeps the two messages distinct', () => {
    expect(UNSAFE_RICH_TEXT_LINK_MESSAGE).not.toBe(UNSAFE_LINK_MESSAGE)
  })
})
