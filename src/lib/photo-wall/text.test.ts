import { describe, expect, it } from 'vitest'
import {
  CAPTION_MAX,
  NAME_MAX,
  codePointCount,
  limitCodePoints,
  limitWallText,
  normalizeWallText,
  wallTextLength,
} from './text'

/**
 * The caption and name rules (Photo Wall spec §6.4, §6.5): limits in code
 * points (80 and 40), and the normalisation the server applies, so what
 * the composer counts is what the server measures.
 */
describe('the limits', () => {
  it('are 80 code points for the caption and 40 for the name', () => {
    expect(CAPTION_MAX).toBe(80)
    expect(NAME_MAX).toBe(40)
  })
})

describe('codePointCount', () => {
  it('counts code points, not UTF-16 units: an emoji is one, a flag is two', () => {
    expect(codePointCount('kubectl')).toBe(7)
    expect(codePointCount('🎉')).toBe(1)
    expect('🎉'.length).toBe(2)
    expect(codePointCount('🇳🇴')).toBe(2)
  })
})

describe('limitCodePoints', () => {
  it('cuts at the limit in code points, never through a surrogate pair', () => {
    expect(limitCodePoints('abc', 5)).toBe('abc')
    expect(limitCodePoints('abcdef', 3)).toBe('abc')
    expect(limitCodePoints('ab🎉cd', 3)).toBe('ab🎉')
    expect(limitCodePoints('ab🎉cd', 2)).toBe('ab')
  })

  it('cuts the NFC form, so a decomposed accent does not slip an extra unit through', () => {
    // "e" + combining acute (2 units, 2 code points) is one code point in NFC.
    const decomposed = 'café'
    expect(codePointCount(decomposed)).toBe(5)
    expect(wallTextLength(decomposed)).toBe(4)
    expect(limitCodePoints(decomposed, 4)).toBe('café')
    expect(limitCodePoints(decomposed, 3)).toBe('caf')
  })
})

describe('normalizeWallText: what the server will store (§6.4)', () => {
  it('is NFC', () => {
    expect(normalizeWallText('café')).toBe('café')
  })

  it('turns any run of whitespace, newlines included, into one space and trims', () => {
    expect(normalizeWallText('  hello \n\n  wall\t!  ')).toBe('hello wall !')
  })

  it('removes control characters FIRST, so the spaces around one fold into one', () => {
    expect(normalizeWallText('be\u0000ep\u001f\u007f')).toBe('beep')
    expect(normalizeWallText('a \u0001 b')).toBe('a b')
    expect(normalizeWallText('a\u0001\nb')).toBe('a b')
  })

  it('removes the bidi formatting characters that could flip the reading order', () => {
    expect(normalizeWallText('\u202eabc')).toBe('abc')
    expect(normalizeWallText('a\u200e\u200fb\u2066c\u2069')).toBe('abc')
    expect(normalizeWallText('\u202a\u202b\u202c\u202d x')).toBe('x')
  })

  it('keeps the zero-width joiner, so a family emoji survives and counts as its code points', () => {
    const family = '👨\u200d👩\u200d👧'
    expect(normalizeWallText(family)).toBe(family)
    expect(wallTextLength(family)).toBe(5)
  })

  it('empty becomes empty (the server stores it as absent)', () => {
    expect(normalizeWallText('   \n ')).toBe('')
  })

  it('never gets longer than the code points the composer counted', () => {
    const typed = limitCodePoints('🎉 '.repeat(60), CAPTION_MAX)
    expect(codePointCount(normalizeWallText(typed))).toBeLessThanOrEqual(
      CAPTION_MAX,
    )
  })
})

describe('wallTextLength and limitWallText: the counter and the cut measure the normalised text', () => {
  it('a double space and a trailing space cost nothing', () => {
    expect(wallTextLength('a  b ')).toBe(3)
    expect(wallTextLength('   ')).toBe(0)
  })

  it('cuts where the normalised text reaches the limit, keeping the typed spaces before it', () => {
    // 'ab  c' normalises to 'ab c', four code points.
    expect(limitWallText('ab  cd', 3)).toBe('ab  ')
    expect(limitWallText('ab  cd', 4)).toBe('ab  c')
    expect(limitWallText('ab  cd', 5)).toBe('ab  cd')
    // The trailing space costs nothing, so it stays.
    expect(limitWallText('🎉 🎉 🎉', 3)).toBe('🎉 🎉 ')
    // 'x x x…' has an odd count, so the best fit under 80 is 79.
    const cut = wallTextLength(limitWallText('x '.repeat(100), CAPTION_MAX))
    expect(cut).toBeLessThanOrEqual(CAPTION_MAX)
    expect(cut).toBeGreaterThanOrEqual(CAPTION_MAX - 1)
    expect(wallTextLength(limitWallText('y'.repeat(100), CAPTION_MAX))).toBe(
      CAPTION_MAX,
    )
  })

  it('never cuts through a surrogate pair or a decomposed accent', () => {
    expect(limitWallText('ab🎉', 2)).toBe('ab')
    expect(limitWallText('cafe\u0301!', 4)).toBe('caf\u00e9')
  })
})
