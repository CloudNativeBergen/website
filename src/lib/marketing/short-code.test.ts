import { describe, expect, it } from 'vitest'
import {
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  createShortCodeMinter,
  drawShortCode,
  normalizeShortCode,
  sequentialShortCodes,
} from './short-code'

/** A deterministic `[0,1)` source that walks a fixed list of values. */
function sequence(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

/** The float that draws alphabet index `i` (the draw floors `r * 31`). */
function draws(indexes: number[]): () => number {
  return sequence(indexes.map((i) => i / SHORT_CODE_ALPHABET.length))
}

describe('the short code alphabet and shape (spec §2.2)', () => {
  it('is 31 lowercase characters with no 0, o, 1, l or i', () => {
    expect(SHORT_CODE_ALPHABET).toBe('abcdefghjkmnpqrstuvwxyz23456789')
    expect(SHORT_CODE_ALPHABET).toHaveLength(31)
    for (const banned of ['0', 'o', '1', 'l', 'i']) {
      expect(SHORT_CODE_ALPHABET).not.toContain(banned)
    }
  })

  it('draws six characters, all from the alphabet', () => {
    const code = drawShortCode()
    expect(code).toHaveLength(SHORT_CODE_LENGTH)
    for (const ch of code) expect(SHORT_CODE_ALPHABET).toContain(ch)
  })

  it('draws the alphabet character the random source selects', () => {
    expect(drawShortCode(draws([0, 1, 2, 30, 29, 28]))).toBe('abc987')
  })
})

describe('normalizeShortCode — lowercase BEFORE the shape check (spec §2.4)', () => {
  it('accepts a well-formed code unchanged', () => {
    expect(normalizeShortCode('abc985')).toBe('abc985')
  })

  it('lowercases a pasted capitalised code and accepts it', () => {
    expect(normalizeShortCode('ABC985')).toBe('abc985')
    expect(normalizeShortCode('AbC985')).toBe('abc985')
  })

  it.each([
    ['too short', 'abc98'],
    ['too long', 'abc9855'],
    ['the excluded letter o', 'abco85'],
    ['the excluded letter i', 'abci85'],
    ['the excluded letter l', 'abcl85'],
    ['the excluded digit 0', 'abc085'],
    ['the excluded digit 1', 'abc185'],
    ['a hyphen', 'abc-85'],
    ['a path traversal', '../../x'],
    ['empty', ''],
  ])('rejects %s', (_label, raw) => {
    expect(normalizeShortCode(raw)).toBeNull()
  })

  it('rejects a code whose excluded character is uppercase', () => {
    // Lowercasing first must not let `O` through as a different character.
    expect(normalizeShortCode('ABCO85')).toBeNull()
  })
})

describe('createShortCodeMinter — a batch checks itself and the conference', () => {
  it('redraws a code the conference already holds', () => {
    // First draw is `aaaaaa`, which is taken; the second is `bbbbbb`.
    const mint = createShortCodeMinter(
      ['aaaaaa'],
      draws([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]),
    )
    expect(mint()).toBe('bbbbbb')
  })

  it('redraws a code the same batch already handed out', () => {
    const mint = createShortCodeMinter(
      [],
      draws([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]),
    )
    expect(mint()).toBe('aaaaaa')
    expect(mint()).toBe('bbbbbb')
  })

  it('normalizes the existing codes it is given, so a stored capital collides', () => {
    const mint = createShortCodeMinter(
      ['AAAAAA'],
      draws([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]),
    )
    expect(mint()).toBe('bbbbbb')
  })

  it('ignores stored values that are not codes rather than throwing', () => {
    const mint = createShortCodeMinter(
      [null as unknown as string, '', 'not-a-code'],
      draws([0, 0, 0, 0, 0, 0]),
    )
    expect(mint()).toBe('aaaaaa')
  })

  it('throws rather than returning a duplicate when it cannot find a free code', () => {
    const mint = createShortCodeMinter(['aaaaaa'], draws([0]))
    expect(() => mint()).toThrow(/short code/i)
  })

  it('mints distinct codes across a whole batch', () => {
    const mint = createShortCodeMinter([])
    const codes = Array.from({ length: 200 }, () => mint())
    expect(new Set(codes).size).toBe(200)
    for (const code of codes) expect(normalizeShortCode(code)).toBe(code)
  })
})

describe('sequentialShortCodes — the deterministic source for tests', () => {
  it('counts through well-formed codes', () => {
    const next = sequentialShortCodes()
    expect(next()).toBe('aaaaaa')
    expect(next()).toBe('aaaaab')
    const codes = [next(), next(), next()]
    for (const code of codes) expect(normalizeShortCode(code)).toBe(code)
    expect(new Set(codes).size).toBe(3)
  })
})
