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
 * control characters and line breaks become spaces; the bidi embedding,
 * override and isolate controls, the zero-width space and the BOM are
 * dropped; whitespace is collapsed; and a curly double quote inside the text
 * becomes a single one. Other format characters stay: the zero-width joiner
 * builds emoji like 🧑🏽‍💻, the non-joiner shapes Persian and Indic text, and
 * the soft hyphen is a line-break hint.
 *
 * FOR DISPLAY ONLY: never use the result as a key.
 */
export function displayName(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/[\u202A-\u202E\u2066-\u2069\u200B\uFEFF]/gu, '')
    .replace(/“/g, '‘')
    .replace(/”/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "1 response", "2 responses". */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`
