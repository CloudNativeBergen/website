import { describe, expect, it, vi } from 'vitest'
import { MAX_PHOTO_BYTES, PhotoEncodeError, encodeWallJpeg } from './encode'
import { listJpegSegments } from './jpeg-strip'

/**
 * The encode (Photo Wall spec §6.5): `toBlob('image/jpeg', 0.85)`, 0.7 again
 * when the result is over 4 MiB, then the APPn strip, handed on as a Blob
 * of type `image/jpeg`.
 */
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 0xff,
  ...payload,
]
const head = [
  0xff,
  0xd8,
  ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  ...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a]),
  0xff,
  0xda,
  0,
  8,
  1,
  1,
  0,
  0,
  63,
  0,
]

/** A "JPEG" of `size` bytes with an Exif APP1 in its header. */
const jpegOf = (size: number) => {
  const bytes = new Uint8Array(size)
  bytes.set(head)
  bytes[size - 2] = 0xff
  bytes[size - 1] = 0xd9
  return new Blob([bytes], { type: 'image/jpeg' })
}

/** A canvas whose encoder answers with a blob of the size given per quality. */
const canvasAnswering = (sizes: Record<string, number | null>) => {
  const toBlob = vi.fn(
    (cb: (blob: Blob | null) => void, _type?: string, quality?: number) => {
      const size = sizes[String(quality)]
      cb(size == null ? null : jpegOf(size))
    },
  )
  return { toBlob }
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())

describe('encodeWallJpeg', () => {
  it('encodes at 0.85 and keeps that when the result is within 4 MiB', async () => {
    const canvas = canvasAnswering({ '0.85': 3_000_000 })
    const blob = await encodeWallJpeg(canvas)
    expect(canvas.toBlob).toHaveBeenCalledTimes(1)
    expect(canvas.toBlob.mock.calls[0].slice(1)).toEqual(['image/jpeg', 0.85])
    expect(blob.type).toBe('image/jpeg')
  })

  it('exactly 4 MiB is not over: no second encode', async () => {
    const canvas = canvasAnswering({ '0.85': MAX_PHOTO_BYTES })
    await encodeWallJpeg(canvas)
    expect(canvas.toBlob).toHaveBeenCalledTimes(1)
  })

  it('encodes again at 0.7 when 0.85 is over 4 MiB, and hands on the 0.7 result', async () => {
    const canvas = canvasAnswering({
      '0.85': MAX_PHOTO_BYTES + 1,
      '0.7': 2_500_000,
    })
    const blob = await encodeWallJpeg(canvas)
    expect(canvas.toBlob.mock.calls.map((c) => c[2])).toEqual([0.85, 0.7])
    // The APP1 (12 + 2 bytes) is gone, nothing else.
    expect(blob.size).toBe(2_500_000 - 14)
  })

  it('judges the 4 MiB limit on the encoder output; the strip only shrinks it', async () => {
    // 0.85 is 10 bytes over, which the strip would bring back under. The
    // rule is still "retry at 0.7": what the server measures is the stripped
    // size, but the composer keeps the spec's order of operations.
    const canvas = canvasAnswering({
      '0.85': MAX_PHOTO_BYTES + 10,
      '0.7': 1_000,
    })
    await encodeWallJpeg(canvas)
    expect(canvas.toBlob).toHaveBeenCalledTimes(2)
  })

  it('strips every APPn but APP0 from the bytes and types the Blob image/jpeg', async () => {
    const blob = await encodeWallJpeg(canvasAnswering({ '0.85': 400 }))
    const bytes = await bytesOf(blob)
    expect(listJpegSegments(bytes).map((s) => s.marker)).toEqual([0xe0])
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8])
    expect([bytes.at(-2), bytes.at(-1)]).toEqual([0xff, 0xd9])
    expect(blob.type).toBe('image/jpeg')
  })

  it('a canvas that cannot encode (null blob) is a PhotoEncodeError', async () => {
    await expect(
      encodeWallJpeg(canvasAnswering({ '0.85': null })),
    ).rejects.toBeInstanceOf(PhotoEncodeError)
  })

  it('a result still over 4 MiB at 0.7 is a PhotoEncodeError, not an upload the server refuses', async () => {
    const canvas = canvasAnswering({
      '0.85': MAX_PHOTO_BYTES + 1,
      '0.7': MAX_PHOTO_BYTES + 1,
    })
    await expect(encodeWallJpeg(canvas)).rejects.toBeInstanceOf(
      PhotoEncodeError,
    )
  })
})
