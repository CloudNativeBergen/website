/**
 * THE CROP (Photo Wall spec §6.5, §6.4). Client-safe and pure.
 *
 * A Wall Post shows a square of the photo's short edge; `{ x, y }` in 0–1
 * say where along the long edge it sits (0 the left or top edge, 1 the right
 * or bottom). There is no zoom. The short axis has no range, so its
 * coordinate is carried but changes nothing.
 */
import type { Size } from './resize'

export interface Crop {
  x: number
  y: number
}

export const CENTER_CROP: Crop = { x: 0.5, y: 0.5 }

const clamp01 = (n: number) =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5

/** Both coordinates in 0–1; a value that is not a number becomes the centre. */
export function clampCrop(crop: Crop): Crop {
  return { x: clamp01(crop.x), y: clamp01(crop.y) }
}

/** The square, in whole pixels of a photo of this size, the crop places. */
export function cropSquare(
  width: number,
  height: number,
  crop: Crop,
): { x: number; y: number; size: number } {
  const size = Math.min(width, height)
  const c = clampCrop(crop)
  return {
    x: Math.round((width - size) * c.x),
    y: Math.round((height - size) * c.y),
    size,
  }
}

/**
 * The crop after a finger moved by `dx`, `dy` CSS px over a window `frame`
 * CSS px wide that shows the short-edge square: the picture follows the
 * finger 1:1, so a drag to the right reveals the left of the photo.
 */
export function dragCrop(
  crop: Crop,
  { dx, dy }: { dx: number; dy: number },
  frame: number,
  photo: Size,
): Crop {
  const size = Math.min(photo.width, photo.height)
  const pixelsPerCssPx = size / frame
  const pan = (from: number, delta: number, range: number) =>
    range > 0 ? clamp01(from - (delta * pixelsPerCssPx) / range) : from
  return {
    x: pan(crop.x, dx, photo.width - size),
    y: pan(crop.y, dy, photo.height - size),
  }
}
