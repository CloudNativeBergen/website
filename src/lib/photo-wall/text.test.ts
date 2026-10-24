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
import { stripDropped } from './wall-text'

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
    const decomposed = 'cafe\u{301}'
    expect(codePointCount(decomposed)).toBe(5)
    expect(wallTextLength(decomposed)).toBe(4)
    expect(limitCodePoints(decomposed, 4)).toBe('café')
    expect(limitCodePoints(decomposed, 3)).toBe('caf')
  })
})

describe('normalizeWallText: what the server will store (§6.4)', () => {
  it('is NFC', () => {
    expect(normalizeWallText('cafe\u{301}')).toBe('café')
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

  it('keeps the flag of England whole, and counts it as the server does: 7 code points', () => {
    // A black flag, five tag letters (g b e n g) and a cancel tag. A tag on
    // its own is dropped, so the flag only survives if the strip sees it whole.
    const england =
      '\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}'
    expect(limitWallText(`Hi ${england}`, CAPTION_MAX)).toBe(`Hi ${england}`)
    expect(wallTextLength(england)).toBe(7)
    // At the limit: 73 letters and the flag are exactly 80.
    const atLimit = `${'x'.repeat(73)}${england}`
    expect(limitWallText(atLimit, CAPTION_MAX)).toBe(atLimit)
    expect(wallTextLength(atLimit)).toBe(CAPTION_MAX)
  })

  it('reads no more of a paste than the server accepts: the first 1000 UTF-16 units', () => {
    // 999 spaces, then 'abc': the 1000th unit is the 'a'. What comes after
    // it is never kept, however few code points the text normalises to.
    const paste = `${' '.repeat(999)}abc`
    expect(limitWallText(paste, CAPTION_MAX)).toBe(`${' '.repeat(999)}a`)
  })

  it('cuts a pasted essay in linear time, not one re-count per letter', () => {
    const started = performance.now()
    const cut = limitWallText('x'.repeat(40_000), CAPTION_MAX)
    expect(performance.now() - started).toBeLessThan(200)
    expect(cut).toBe('x'.repeat(CAPTION_MAX))
  })

  it('keeps the longest prefix whose normalised text fits, on mixed input', () => {
    // The definition, one re-count per prefix: slow, but obviously right.
    const longestFitting = (text: string, max: number) => {
      const points = Array.from(stripDropped(text).normalize('NFC'))
      let n = points.length
      while (n > 0 && wallTextLength(points.slice(0, n).join('')) > max) n -= 1
      return points.slice(0, n).join('')
    }
    const alphabet = [
      'a',
      ' ',
      '\n',
      '\t',
      '\u0001',
      '\u{202e}',
      '🎉',
      '\u{200d}',
      'e\u{301}',
    ]
    let seed = 7
    const next = () => (seed = (seed * 48271) % 2147483647)
    for (let run = 0; run < 300; run += 1) {
      const text = Array.from(
        { length: next() % 40 },
        () => alphabet[next() % alphabet.length],
      ).join('')
      const max = next() % 12
      const cut = limitWallText(text, max)
      expect(wallTextLength(cut)).toBeLessThanOrEqual(max)
      expect(normalizeWallText(cut)).toBe(
        normalizeWallText(longestFitting(text, max)),
      )
    }
  })

  it('cuts a crafted paste of combining marks without freezing the page', () => {
    const crafted = 'a' + '\u{316}\u{300}'.repeat(100_000)
    const started = performance.now()
    const cut = limitWallText(crafted, CAPTION_MAX)
    expect(performance.now() - started).toBeLessThan(200)
    expect(wallTextLength(cut)).toBeLessThanOrEqual(CAPTION_MAX)
  })
})
