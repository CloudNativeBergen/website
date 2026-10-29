/**
 * THE ENCODE (Photo Wall spec §6.5, §6.4). Client-safe; needs only something
 * with a canvas's `toBlob`, so the rule is testable without a canvas.
 *
 * `toBlob('image/jpeg', 0.85)`; if that is over 4 MiB, once more at 0.7.
 * Then the APPn strip, and the bytes go on as a Blob of type `image/jpeg`:
 * the photo part of the submit (§6.2), inside the server's size rule.
 */
import { stripJpegMetadata } from './jpeg-strip'

/** The server's size rule: 4 MiB, 4,194,304 bytes (§6.4). */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

export const JPEG_QUALITY = 0.85
export const JPEG_QUALITY_FALLBACK = 0.7

/** Shown as "Something went wrong" by the composer; never a server refusal. */
export class PhotoEncodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoEncodeError'
  }
}

export interface EncodableCanvas {
  toBlob(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void
}

const toJpegBlob = (canvas: EncodableCanvas, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new PhotoEncodeError('The canvas could not encode a JPEG')),
      'image/jpeg',
      quality,
    )
  })

/** The filtered, resized photo as the JPEG bytes the composer uploads. */
export async function encodeWallJpeg(canvas: EncodableCanvas): Promise<Blob> {
  let blob = await toJpegBlob(canvas, JPEG_QUALITY)
  if (blob.size > MAX_PHOTO_BYTES) {
    blob = await toJpegBlob(canvas, JPEG_QUALITY_FALLBACK)
  }
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new PhotoEncodeError(
      `The JPEG is ${blob.size} bytes at quality ${JPEG_QUALITY_FALLBACK}, over ${MAX_PHOTO_BYTES}`,
    )
  }
  const bytes = stripJpegMetadata(new Uint8Array(await blob.arrayBuffer()))
  return new Blob([bytes], { type: 'image/jpeg' })
}
