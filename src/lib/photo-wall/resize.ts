/**
 * THE RESIZE MATHS (Photo Wall spec §6.5). Client-safe and pure: the sizes
 * only, drawing is the composer's.
 *
 * The uploaded JPEG has a long edge of at most 2048 px. iOS caps a canvas at
 * about 4096 px on a side and 16.7 M pixels, so a 24 or 48 MP photo cannot be
 * drawn at full size first: it goes through intermediate canvases, each
 * inside the caps and each at most a 2x reduction, which also keeps the
 * downscale from aliasing.
 */

export const MAX_LONG_EDGE = 2048
/** The server's short-edge rule (§6.4): a thinner photo is refused before encoding. */
export const MIN_SHORT_EDGE = 320
export const IOS_CANVAS_MAX_SIDE = 4096
export const IOS_CANVAS_MAX_PIXELS = 16_777_216

export interface Size {
  width: number
  height: number
}

const scaled = (width: number, height: number, factor: number): Size => ({
  width: Math.max(1, Math.round(width * factor)),
  height: Math.max(1, Math.round(height * factor)),
})

/** The same shape with its long edge at most `max` px; unchanged when it fits. */
export function fitLongEdge(
  width: number,
  height: number,
  max = MAX_LONG_EDGE,
): Size {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  // The long edge lands on `max` exactly: `long * (max / long)` is within
  // two rounding errors of an integer, which Math.round puts back on it.
  return scaled(width, height, max / long)
}

/**
 * The largest shape of this aspect that an iOS canvas takes. The side cap
 * is the only one that binds: 4096 x 4096 is exactly the pixel cap, so a
 * canvas inside 4096 px on both sides is inside 16.7 M pixels too.
 */
const insideCanvasCaps = ({ width, height }: Size): Size =>
  fitLongEdge(width, height, IOS_CANVAS_MAX_SIDE)

/**
 * The canvas sizes a photo of `width` x `height` is drawn through, in order,
 * ending at {@link fitLongEdge} for `max`. One entry when the photo is
 * already within 2x of the target (or fits as it is). The same chain makes
 * the preview copies and the strip's thumbnails from the master.
 */
export function resizeSteps(
  width: number,
  height: number,
  max = MAX_LONG_EDGE,
): Size[] {
  const target = fitLongEdge(width, height, max)
  const steps: Size[] = []
  let current: Size = { width, height }
  while (Math.max(current.width, current.height) > 2 * max) {
    current = insideCanvasCaps(scaled(current.width, current.height, 0.5))
    steps.push(current)
  }
  steps.push(target)
  return steps
}

/**
 * Whether a photo of this size is too small or too narrow for the wall: its
 * short edge, once the long edge is at most 2048 px, is under 320 px (a
 * 4000x600 panorama becomes 2048x307; a 300x200 photo stays as it is).
 */
export function isTooSmallForWall(width: number, height: number): boolean {
  const fitted = fitLongEdge(width, height)
  return Math.min(fitted.width, fitted.height) < MIN_SHORT_EDGE
}
