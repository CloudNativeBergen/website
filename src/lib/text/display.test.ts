import { describe, expect, it } from 'vitest'
import { displayName, plural } from './display'

describe('displayName', () => {
  it('drops bidi controls, zero-width spaces and the BOM, and puts the text on one line', () => {
    expect(displayName(' Early\u0000\n\tBird ‮drib‬ ⁦x⁩ ​﻿(2 days)  ')).toBe(
      'Early Bird drib x (2 days)',
    )
  })

  it('drops the bidi marks too, which reorder text as an override does', () => {
    // RLM, LRM, ALM; and a word joiner and an invisible separator.
    expect(displayName('Talk\u200F\u200E\u061C title\u2060\u2063 here')).toBe(
      'Talk title here',
    )
    expect(displayName('\u200F\u061C')).toBe('')
  })

  it('keeps a joined emoji, a zero-width non-joiner and a soft hyphen', () => {
    const developer = '\u{1F9D1}\u{1F3FD}‍\u{1F4BB}'
    expect(displayName(`Live coding ${developer}`)).toBe(
      `Live coding ${developer}`,
    )
    expect(displayName('می‌خواهم')).toBe('می‌خواهم')
    expect(displayName('Kuber­netes')).toBe('Kuber­netes')
  })

  it('keeps a flag built from tags, and drops tags anywhere else', () => {
    const scotland =
      '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'
    expect(displayName(`KubeCon ${scotland}`)).toBe(`KubeCon ${scotland}`)
    // Hidden tag text, outside a flag, or dressed as a long one.
    expect(displayName('Talk\u{E0068}\u{E0069}\u{E007F} title')).toBe(
      'Talk title',
    )
    const hidden = [...'ignoreall'].map((c) =>
      String.fromCodePoint(0xe0000 + c.codePointAt(0)!),
    )
    expect(displayName(`Talk \u{1F3F4}${hidden.join('')}\u{E007F}`)).toBe(
      'Talk \u{1F3F4}',
    )
  })

  it('is empty when no visible character remains', () => {
    expect(displayName('\u200D\u2060\u00AD\u200B\u200C \uFEFF')).toBe('')
    expect(displayName('\u034F\u3164')).toBe('')
    expect(displayName('a\u200D')).toBe('a\u200D')
  })

  it('turns curly double quotes into single ones, so ours cannot be closed', () => {
    expect(displayName('A “quoted” title')).toBe('A ‘quoted’ title')
  })
})

describe('plural', () => {
  it('uses the singular for one only', () => {
    expect(plural(1, 'response', 'responses')).toBe('1 response')
    expect(plural(0, 'response', 'responses')).toBe('0 responses')
    expect(plural(2, 'response', 'responses')).toBe('2 responses')
  })
})
