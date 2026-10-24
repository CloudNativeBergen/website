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
import { isTooSmallForWall, resizeSteps, type Size } from './resize'

/** Shown as "This photo couldn't be opened. Try another one, or take a new photo." */
export class PhotoDecodeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PhotoDecodeError'
  }
}

/** Shown as "This photo is too small or too narrow for the wall. …" (§6.4's 320 px rule). */
export class PhotoTooSmallError extends Error {
  constructor(width: number, height: number) {
    super(`A ${width}x${height} photo is under the 320 px short edge`)
    this.name = 'PhotoTooSmallError'
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
 * JPEG has no transparency: a transparent pixel (a screenshot, a sticker)
 * would show the page through it in the preview but turn black in the upload.
 * The master is flattened onto white once, so both read the same pixels.
 */
const flattened = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const ctx = contextOf(canvas)
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'source-over'
  return canvas
}

/**
 * The decoded photo, the right way up. Safari before 17.2 (iOS 16, 17.0 and
 * 17.1) has no `imageOrientation: 'from-image'` and rejects the options with
 * a TypeError (webkit.org/b/250476); it applies the EXIF orientation without
 * them, as current Chromium does, so the plain call is the fallback. A file
 * the browser cannot decode rejects with something else and is not retried.
 */
async function orientedBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    return createImageBitmap(file)
  }
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
    bitmap = await orientedBitmap(file)
  } catch (cause) {
    throw new PhotoDecodeError('The browser could not decode the photo', {
      cause,
    })
  }
  try {
    if (isTooSmallForWall(bitmap.width, bitmap.height)) {
      throw new PhotoTooSmallError(bitmap.width, bitmap.height)
    }
    const steps = resizeSteps(bitmap.width, bitmap.height)
    const target = steps[steps.length - 1]
    if (steps.length > 1) {
      // Let the browser resize in one go (Chrome, and Safari since 15); the
      // size it hands back is checked, and the stepped canvases are the
      // fallback for one that ignores the options.
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'high',
      })
      if (resized.width === target.width && resized.height === target.height) {
        try {
          return flattened(draw(resized, target))
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
    return flattened(canvas ?? draw(bitmap, target))
  } finally {
    bitmap.close()
  }
}

/**
 * A copy of the master with the filter applied: at the master's size for
 * the bake, or with a long edge of `longEdge` for the preview and the strip's
 * thumbnails, drawn through the same halving chain as the resize so a 128 px
 * thumbnail is not one 2048→128 `drawImage`. Drawn into `into` when given,
 * so a visible canvas is reused.
 */
export function filteredCopy(
  master: HTMLCanvasElement,
  filter: WallFilterKey,
  longEdge?: number,
  into?: HTMLCanvasElement,
): HTMLCanvasElement {
  const steps = longEdge
    ? resizeSteps(master.width, master.height, longEdge)
    : [{ width: master.width, height: master.height }]
  const size = steps[steps.length - 1]
  if (into) {
    into.width = size.width
    into.height = size.height
  }
  let source: CanvasImageSource = master
  for (const step of steps.slice(0, -1)) source = draw(source, step)
  const canvas = draw(source, size, into)
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
