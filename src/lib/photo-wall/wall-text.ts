/**
 * THE CAPTION AND NAME RULE (Photo Wall spec §6.4), one module for the phone
 * and the server, so a caption the composer accepts is never refused for its
 * text and is stored exactly as the counter measured it. Client-safe and
 * pure.
 *
 * In order: the dropped characters go; every run of whitespace, newlines
 * included, becomes one space; the ends are trimmed; NFC last, so a dropped
 * character between a letter and its accent can't leave them apart; a text
 * with nothing visible left is empty, the server's "absent".
 */

/**
 * What goes: control characters (`Cc`) and format characters (`Cf`: the
 * bidi marks, embeddings, overrides and isolates that can make a caption
 * read backwards, zero-width spaces, soft hyphens, tag characters), plus the
 * blank-looking letters (the Hangul fillers and the blank Braille pattern)
 * that would make an invisible name. Kept: the whitespace controls, which
 * the next step folds into a space, and the joiners U+200C and U+200D, which
 * emoji sequences and Persian and Indic scripts need.
 */
const DROPPED =
  /(?![\t\n\v\f\r\u{200c}\u{200d}])[\p{Cc}\p{Cf}\u{115f}\u{1160}\u{3164}\u{ffa0}\u{2800}]/u

/** Something a reader can see: a letter, digit, punctuation or symbol. */
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u

/** Whether one code point is dropped by {@link normalizeWallText}. */
export function isDroppedPoint(point: string): boolean {
  return DROPPED.test(point)
}

/** The caption or name as the server stores it (§6.4); `''` for none. */
export function normalizeWallText(text: string): string {
  const kept = Array.from(text)
    .filter((point) => !isDroppedPoint(point))
    .join('')
  const folded = kept.replace(/\s+/gu, ' ').trim().normalize('NFC')
  return VISIBLE.test(folded) ? folded : ''
}
