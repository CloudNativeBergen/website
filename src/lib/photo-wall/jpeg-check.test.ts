/**
 * @vitest-environment node
 *
 * The JPEG checks (Photo Wall spec §6.4) on REAL files in
 * `__tests__/fixtures/photo-wall/`:
 *
 * - `canvas-chromium.jpg`, `wide-4096.jpg`, `small-200.jpg`: Chromium 153's
 *   `canvas.toBlob('image/jpeg')` through Playwright; `truncated.jpg` is the
 *   first file cut 64 bytes before its EOI.
 * - `camera-exif.jpg` (an EXIF APP1 with Make, Model, DateTimeOriginal and a
 *   GPS IFD), `comment.jpg` (a COM segment), `png-renamed.jpg`: Pillow 12.
 * - `iptc-app13.jpg`: a Pillow JPEG with a Photoshop IRB APP13 segment
 *   carrying IPTC Keywords and By-line records spliced after its APP0.
 *
 * A Safari-made sample (after the composer's APPn strip, M2) is added once
 * that fixture exists.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_BYTES, checkWallPhoto } from './jpeg-check'

const FIXTURES = join(__dirname, '../../../__tests__/fixtures/photo-wall')
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(FIXTURES, name)))

/** The file with `segment` (marker + length + payload) spliced after APP0. */
function withSegment(bytes: Uint8Array, marker: number, payload: Uint8Array) {
  const app0Length = (bytes[4] << 8) | bytes[5]
  const cut = 4 + app0Length
  const length = payload.length + 2
  const header = Uint8Array.of(0xff, marker, length >> 8, length & 0xff)
  const out = new Uint8Array(bytes.length + header.length + payload.length)
  out.set(bytes.subarray(0, cut))
  out.set(header, cut)
  out.set(payload, cut + header.length)
  out.set(bytes.subarray(cut), cut + header.length + payload.length)
  return out
}

const ascii = (s: string) => new TextEncoder().encode(s)

describe('checkWallPhoto accepts', () => {
  it('a Chromium canvas JPEG, reporting its dimensions', () => {
    expect(checkWallPhoto(fixture('canvas-chromium.jpg'))).toEqual({
      ok: true,
      width: 640,
      height: 480,
    })
  })

  it('a colour profile (APP2 ICC_PROFILE, which Chromium writes), since it names no person or place', () => {
    const bytes = fixture('canvas-chromium.jpg')
    // The fixture itself carries one; prove the check SAW it by removing
    // the identifier: the same segment under another name is refused.
    const spliced = withSegment(
      bytes,
      0xe2,
      new Uint8Array([...ascii('FPXR\0'), 1, 0, 0, 0]),
    )
    expect(checkWallPhoto(spliced)).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'APP2',
    })
  })

  it('exactly 4 MiB by size, so the size rule is ≤, not <', () => {
    const bytes = fixture('canvas-chromium.jpg')
    const padded = new Uint8Array(MAX_PHOTO_BYTES)
    padded.set(bytes)
    // Not refused for SIZE; the zero padding after the scan is what fails.
    expect(checkWallPhoto(padded)).toEqual({ ok: false, reason: 'truncated' })
  })
})

describe('checkWallPhoto refuses', () => {
  it('a camera JPEG with EXIF (APP1)', () => {
    expect(checkWallPhoto(fixture('camera-exif.jpg'))).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'APP1',
    })
  })

  it('a JPEG with an IPTC APP13 segment', () => {
    expect(checkWallPhoto(fixture('iptc-app13.jpg'))).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'APP13',
    })
  })

  it('a JPEG with a COM segment', () => {
    expect(checkWallPhoto(fixture('comment.jpg'))).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'COM',
    })
  })

  it('a PNG renamed .jpg', () => {
    expect(checkWallPhoto(fixture('png-renamed.jpg'))).toEqual({
      ok: false,
      reason: 'notJpeg',
    })
  })

  it('a truncated file, which has no EOI', () => {
    expect(checkWallPhoto(fixture('truncated.jpg'))).toEqual({
      ok: false,
      reason: 'truncated',
    })
  })

  it('a 4096 px wide image (long edge over 2048)', () => {
    expect(checkWallPhoto(fixture('wide-4096.jpg'))).toEqual({
      ok: false,
      reason: 'longEdge',
      width: 4096,
      height: 320,
    })
  })

  it('a 200 px image (short edge under 320)', () => {
    expect(checkWallPhoto(fixture('small-200.jpg'))).toEqual({
      ok: false,
      reason: 'shortEdge',
      width: 200,
      height: 200,
    })
  })

  it('more than 4,194,304 bytes, before looking at the bytes', () => {
    const bytes = fixture('canvas-chromium.jpg')
    const padded = new Uint8Array(MAX_PHOTO_BYTES + 1)
    padded.set(bytes)
    expect(MAX_PHOTO_BYTES).toBe(4 * 1024 * 1024)
    expect(checkWallPhoto(padded)).toEqual({ ok: false, reason: 'size' })
  })

  it('bytes after the EOI marker', () => {
    const bytes = fixture('canvas-chromium.jpg')
    const trailing = new Uint8Array([...bytes, 0x00])
    expect(checkWallPhoto(trailing)).toEqual({
      ok: false,
      reason: 'truncated',
    })
  })

  it('a file that is only a JPEG signature, or empty', () => {
    expect(checkWallPhoto(new Uint8Array())).toEqual({
      ok: false,
      reason: 'notJpeg',
    })
    expect(checkWallPhoto(Uint8Array.of(0xff, 0xd8, 0xff))).toEqual({
      ok: false,
      reason: 'truncated',
    })
  })

  it('a segment whose length runs past the end of the file', () => {
    const bytes = fixture('canvas-chromium.jpg').slice()
    bytes[4] = 0xff // APP0's length high byte
    expect(checkWallPhoto(bytes)).toEqual({ ok: false, reason: 'truncated' })
  })

  it('a JPEG with no frame header before its scan', () => {
    const bytes = fixture('canvas-chromium.jpg')
    // Rename the SOF0 marker to a DHT one.
    const sof = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xc0)
    expect(sof).toBeGreaterThan(0)
    const broken = bytes.slice()
    broken[sof + 1] = 0xc4
    expect(checkWallPhoto(broken)).toEqual({ ok: false, reason: 'malformed' })
  })
})
