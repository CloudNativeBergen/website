import { describe, expect, it } from 'vitest'
import {
  CAPTION_MAX,
  NAME_MAX,
  codePointCount,
  limitCodePoints,
  normalizeWallText,
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

  it('counts the NFC form, so a decomposed accent does not slip an extra unit through', () => {
    // "e" + combining acute (2 units, 2 code points) is one code point in NFC.
    const decomposed = 'café'
    expect(Array.from(decomposed).length).toBe(5)
    expect(codePointCount(decomposed)).toBe(4)
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

  it('removes control characters', () => {
    expect(normalizeWallText('be\u0000ep\u001f\u007f')).toBe('beep')
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
