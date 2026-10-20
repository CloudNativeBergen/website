/**
 * Small, client-safe helpers for showing free text and counts in copy.
 */

/**
 * Free text (a ticket type's name, a workshop's or a talk's title) made safe
 * to show inside a title's quotes.
 *
 * Shown as it arrives, a `”` in it would close the title's quote and let the
 * rest read as this system's own words, and a bidi override, a NUL or a line
 * break would be stored into a bell notification or an email subject. So
 * control characters and line breaks become spaces; every format character
 * (the bidi marks, embeddings, overrides and isolates, the zero-width space,
 * the BOM) is dropped; whitespace is collapsed; and a curly double quote
 * inside the text becomes a single one. Three format characters stay: the
 * zero-width joiner builds emoji like 🧑🏽‍💻, the non-joiner shapes Persian
 * and Indic text, and the soft hyphen is a line-break hint. None of them
 * reorders text.
 *
 * Empty when no visible character remains (a name of only joiners, soft
 * hyphens or fillers), so the caller's fallback shows instead of `“”`.
 *
 * FOR DISPLAY ONLY: never use the result as a key.
 */
export function displayName(text: string): string {
  const shown = text
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/(?![\u200C\u200D\u00AD])\p{Cf}/gu, '')
    .replace(/“/g, '‘')
    .replace(/”/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
  return VISIBLE.test(shown) ? shown : ''
}

/**
 * A character that shows: not a format character (joiners, soft hyphen),
 * separator or control, nor the combining grapheme joiner or a Hangul filler.
 */
const VISIBLE = /[^\p{Cf}\p{Z}\p{Cc}\u034F\u115F\u1160\u3164\uFFA0]/u

/** "1 response", "2 responses". */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`
