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
  const size = scaled(width, height, max / long)
  // Rounding never moves the long edge off the maximum.
  if (width >= height) size.width = max
  else size.height = max
  return size
}

/** The largest shape of this aspect that an iOS canvas takes. */
function insideCanvasCaps({ width, height }: Size): Size {
  let size = fitLongEdge(width, height, IOS_CANVAS_MAX_SIDE)
  if (size.width * size.height > IOS_CANVAS_MAX_PIXELS) {
    size = scaled(
      size.width,
      size.height,
      Math.sqrt(IOS_CANVAS_MAX_PIXELS / (size.width * size.height)),
    )
  }
  return size
}

/**
 * The canvas sizes a photo of `width` x `height` is drawn through, in order,
 * ending at {@link fitLongEdge}. One entry when the photo is already within
 * 2x of the target (or fits as it is).
 */
export function resizeSteps(width: number, height: number): Size[] {
  const target = fitLongEdge(width, height)
  const steps: Size[] = []
  let current: Size = { width, height }
  while (Math.max(current.width, current.height) > 2 * MAX_LONG_EDGE) {
    current = insideCanvasCaps(scaled(current.width, current.height, 0.5))
    steps.push(current)
  }
  steps.push(target)
  return steps
}
