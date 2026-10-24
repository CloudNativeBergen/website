/**
 * THE CAPTION AND NAME (Photo Wall spec §6.4, §6.5). Client-safe and pure.
 *
 * Limits are in code points of the NORMALISED text, the measure the server
 * refuses on. The normalisation here is the server's rule in the server's
 * order, so a caption the composer accepts is never refused for its text.
 */

export const CAPTION_MAX = 80
export const NAME_MAX = 40

/** Code points, not UTF-16 units: an emoji is one. */
export function codePointCount(text: string): number {
  return Array.from(text).length
}

/** The NFC text cut to at most `max` code points. */
export function limitCodePoints(text: string, max: number): string {
  return Array.from(text.normalize('NFC')).slice(0, max).join('')
}

/**
 * What goes: control characters (but not the whitespace ones, which the next
 * step folds into spaces: the spec's "newlines included") and the bidi
 * formatting characters (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069),
 * which could flip a caption's reading order. The zero-width joiner stays,
 * so a family emoji survives.
 */
const REMOVED =
  /(?![\t\n\v\f\r])[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu

/**
 * What the server stores (§6.4), in its order: NFC; control and bidi
 * formatting characters removed; any run of whitespace, newlines included,
 * becomes one space; trimmed. Empty stays empty, the server's "absent".
 */
export function normalizeWallText(text: string): string {
  return text.normalize('NFC').replace(REMOVED, '').replace(/\s+/gu, ' ').trim()
}

/** What the counter shows: the code points the server will measure. */
export function wallTextLength(text: string): number {
  return codePointCount(normalizeWallText(text))
}

/**
 * The typed text, NFC, cut so that its NORMALISED form has at most `max`
 * code points: a double space or a trailing space costs nothing, a pasted
 * essay is cut where the server would start refusing.
 */
export function limitWallText(text: string, max: number): string {
  const points = Array.from(text.normalize('NFC'))
  let n = points.length
  while (n > 0 && wallTextLength(points.slice(0, n).join('')) > max) n -= 1
  return points.slice(0, n).join('')
}
