import { describe, expect, it } from 'vitest'
import { isDroppedPoint, normalizeWallText } from './wall-text'

describe('normalizeWallText (Photo Wall spec §6.4)', () => {
  it('folds whitespace runs, newlines included, into one space and trims', () => {
    expect(normalizeWallText('  kubectl   apply\n\t-f  joy ')).toBe(
      'kubectl apply -f joy',
    )
    expect(normalizeWallText('a\nb')).toBe('a b')
    expect(normalizeWallText('a \u0001 b')).toBe('a b')
  })

  it('drops every bidi control, so a caption cannot read backwards', () => {
    // All twelve characters with Bidi_Control, the Arabic letter mark too.
    const bidi = Array.from({ length: 0x10ffff }, (_, cp) => cp)
      .filter((cp) => cp < 0xd800 || cp > 0xdfff)
      .map((cp) => String.fromCodePoint(cp))
      .filter((point) => /\p{Bidi_Control}/u.test(point))
    expect(bidi).toHaveLength(12)
    for (const point of bidi) {
      expect(normalizeWallText(`${point}abc`)).toBe('abc')
    }
  })

  it('drops zero-width, tag and soft-hyphen characters but keeps the joiners', () => {
    expect(normalizeWallText('a\u{200b}b\u{ad}c\u{2060}d\u{e0041}e')).toBe(
      'abcde',
    )
    const family = '👨\u{200d}👩\u{200d}👧'
    expect(normalizeWallText(family)).toBe(family)
    expect(isDroppedPoint('\u{200c}')).toBe(false)
    expect(isDroppedPoint('\u{200d}')).toBe(false)
  })

  it('makes a name with nothing visible absent', () => {
    for (const blank of [
      '\u{200b}',
      '\u{3164}\u{3164}',
      '\u{2800}',
      '\u{e0041}\u{e0042}',
      '\u{200d}',
      ' \n ',
    ]) {
      expect(normalizeWallText(blank)).toBe('')
    }
  })

  it('composes NFC after dropping, so a mark between a letter and its accent leaves NFC text', () => {
    const stored = normalizeWallText('Cafe\u{200e}\u{301}')
    expect(stored).toBe('Café')
    expect(stored.normalize('NFC')).toBe(stored)
  })
})
