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
 * control characters and line breaks become spaces, invisible formatting
 * characters (zero-width, bidi, BOM) are dropped, whitespace is collapsed,
 * and a curly double quote inside the text becomes a single one.
 *
 * FOR DISPLAY ONLY: never use the result as a key.
 */
export function displayName(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(/“/g, '‘')
    .replace(/”/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "1 response", "2 responses". */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`
