/**
 * THE CAPTION AND NAME (Photo Wall spec §6.4, §6.5). Client-safe and pure.
 *
 * Limits are in code points, counted on the NFC form, the measure the server
 * refuses on. The normalisation here is the server's rule, so a caption the
 * composer accepts is never refused for its text.
 */

export const CAPTION_MAX = 80
export const NAME_MAX = 40

/** Code points of the NFC form, the unit of both limits. */
export function codePointCount(text: string): number {
  return Array.from(text.normalize('NFC')).length
}

/** The NFC text cut to at most `max` code points. */
export function limitCodePoints(text: string, max: number): string {
  const points = Array.from(text.normalize('NFC'))
  return points.length <= max ? points.join('') : points.slice(0, max).join('')
}

/**
 * What the server stores (§6.4): NFC; control characters removed; any run
 * of whitespace, newlines included, becomes one space; trimmed. Empty stays
 * empty, the server's "absent".
 */
export function normalizeWallText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim()
}
