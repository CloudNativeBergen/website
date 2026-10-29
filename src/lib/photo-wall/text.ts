/**
 * THE CAPTION AND NAME (Photo Wall spec §6.4, §6.5). Client-safe and pure.
 *
 * Limits are in code points of the NORMALISED text, the measure the server
 * refuses on. The rule itself lives in `wall-text.ts`, which the server's
 * field checks use too, so a caption the composer accepts is never refused
 * for its text.
 */
import { MAX_TEXT_INPUT, normalizeWallText, stripDropped } from './wall-text'

export { normalizeWallText }

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

/** What the counter shows: the code points the server will measure. */
export function wallTextLength(text: string): number {
  return codePointCount(normalizeWallText(text))
}

/**
 * The typed text without the characters the server drops, NFC, cut so that
 * its NORMALISED form has at most `max` code points: a double space or a
 * trailing space costs nothing, a pasted essay is cut where the server would
 * start refusing.
 */
export function limitWallText(text: string, max: number): string {
  // The dropped characters are invisible, so they leave the field at once;
  // what remains is NFC, and one pass counts what the normalisation keeps: a
  // whitespace run costs one space only once a visible character follows it,
  // and the cut falls before the first character that would go over. A
  // pasted essay stays instant.
  // A paste over the server's raw cap is cut first: NFC on a long crafted
  // run of combining marks would freeze the page.
  const capped =
    text.length > MAX_TEXT_INPUT ? text.slice(0, MAX_TEXT_INPUT) : text
  const points = Array.from(stripDropped(capped).normalize('NFC'))
  let kept = 0
  let spaceOwed = false
  for (let i = 0; i < points.length; i += 1) {
    if (/\s/u.test(points[i])) {
      spaceOwed = kept > 0
      continue
    }
    const cost = spaceOwed ? 2 : 1
    if (kept + cost > max) return points.slice(0, i).join('')
    kept += cost
    spaceOwed = false
  }
  return points.join('')
}
