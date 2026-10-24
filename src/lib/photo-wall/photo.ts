/**
 * PHOTO PROCESSING ON THE PHONE (Photo Wall spec §6.5). Browser only: the
 * canvas work around the pure modules (`resize`, `filters`, `encode`).
 *
 * Decode with `createImageBitmap` (the EXIF orientation applied), resize so
 * the long edge is at most 2048 px through canvases an iOS Safari can
 * allocate, apply one of the nine filters to the pixels, encode the JPEG and
 * strip what the encoder added. The preview runs the same filter code on a
 * small copy of the same resized photo.
 */
import { encodeWallJpeg } from './encode'
import { applyWallFilter, type WallFilterKey } from './filters'
import { fitLongEdge, resizeSteps, type Size } from './resize'

/** Shown as "This photo couldn't be opened. Try another one, or take a new photo." */
export class PhotoDecodeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PhotoDecodeError'
  }
}

/** The preview copy's long edge: sharp enough for a phone's square window. */
export const PREVIEW_LONG_EDGE = 1024
/** The filter strip's thumbnails. */
export const THUMBNAIL_LONG_EDGE = 128

const canvasOf = ({ width, height }: Size): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const contextOf = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoDecodeError('No 2D canvas context')
  return ctx
}

const draw = (
  source: CanvasImageSource,
  size: Size,
  into = canvasOf(size),
): HTMLCanvasElement => {
  const ctx = contextOf(into)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, size.width, size.height)
  return into
}

/**
 * The photo as the browser decodes it, oriented, drawn onto a canvas with a
 * long edge of at most 2048 px and no filter: the master the preview copies
 * and the bake read from. Rejects with {@link PhotoDecodeError} for a file
 * the browser cannot decode (HEIC on some Android browsers).
 */
export async function decodeWallPhoto(file: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (cause) {
    throw new PhotoDecodeError('The browser could not decode the photo', {
      cause,
    })
  }
  try {
    const steps = resizeSteps(bitmap.width, bitmap.height)
    const target = steps[steps.length - 1]
    if (steps.length > 1) {
      // Let the browser resize in one go where it supports the options
      // (Chrome does; Safari ignores them and hands back the full size).
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'high',
      })
      if (resized.width === target.width && resized.height === target.height) {
        try {
          return draw(resized, target)
        } finally {
          resized.close()
        }
      }
      resized.close()
    }
    let source: CanvasImageSource = bitmap
    let canvas: HTMLCanvasElement | null = null
    for (const step of steps) {
      canvas = draw(source, step)
      source = canvas
    }
    return canvas ?? draw(bitmap, target)
  } finally {
    bitmap.close()
  }
}

/**
 * A copy of the master with the filter applied: at the master's size for
 * the bake, or with a long edge of `longEdge` for the preview and the strip's
 * thumbnails. Drawn into `into` when given, so a visible canvas is reused.
 */
export function filteredCopy(
  master: HTMLCanvasElement,
  filter: WallFilterKey,
  longEdge?: number,
  into?: HTMLCanvasElement,
): HTMLCanvasElement {
  const size = longEdge
    ? fitLongEdge(master.width, master.height, longEdge)
    : { width: master.width, height: master.height }
  if (into) {
    into.width = size.width
    into.height = size.height
  }
  const canvas = draw(master, size, into)
  if (filter !== 'original') {
    const ctx = contextOf(canvas)
    const image = ctx.getImageData(0, 0, size.width, size.height)
    applyWallFilter(image.data, size.width, size.height, filter)
    ctx.putImageData(image, 0, 0)
  }
  return canvas
}

/** The uploaded photo: the master with the filter baked in, as stripped JPEG bytes. */
export function bakeWallPhoto(
  master: HTMLCanvasElement,
  filter: WallFilterKey,
): Promise<Blob> {
  return encodeWallJpeg(filteredCopy(master, filter))
}
