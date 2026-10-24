/**
 * @vitest-environment node
 *
 * The JPEG checks (Photo Wall spec §6.4) on REAL files in
 * `__tests__/fixtures/photo-wall/` (see `make-canvas-fixtures.mjs` there):
 *
 * - `canvas-chromium.jpg`, `wide-4096.jpg`, `small-200.jpg`: Chromium 153's
 *   `canvas.toBlob('image/jpeg')` through Playwright, after the composer's
 *   APPn strip (§6.5); `truncated.jpg` is the first file cut 64 bytes before
 *   its EOI. `canvas-chromium-raw.jpg` is the same canvas output UNSTRIPPED:
 *   Chromium writes an APP2 ICC profile with every JPEG.
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

/** The index of the first `FF <marker>` in the file. */
const markerAt = (bytes: Uint8Array, marker: number) =>
  bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === marker)

describe('checkWallPhoto accepts', () => {
  it('a Chromium canvas JPEG after the composer’s strip, reporting its dimensions', () => {
    expect(checkWallPhoto(fixture('canvas-chromium.jpg'))).toEqual({
      ok: true,
      width: 640,
      height: 480,
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
  it('a raw Chromium canvas JPEG, which carries an APP2 ICC profile the composer must strip', () => {
    expect(checkWallPhoto(fixture('canvas-chromium-raw.jpg'))).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'APP2',
    })
  })

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
    // The same on a metadata segment: cut short is the answer, not the
    // segment it never finished reading.
    const exif = fixture('camera-exif.jpg').slice()
    const app1 = markerAt(exif, 0xe1)
    expect(app1).toBeGreaterThan(0)
    exif[app1 + 2] = 0xff
    expect(checkWallPhoto(exif)).toEqual({ ok: false, reason: 'truncated' })
  })

  it('a JPEG with no frame header before its scan', () => {
    const bytes = fixture('canvas-chromium.jpg')
    const sof = markerAt(bytes, 0xc0)
    expect(sof).toBeGreaterThan(0)
    const broken = bytes.slice()
    broken[sof + 1] = 0xc4 // Renamed to a DHT marker.
    expect(checkWallPhoto(broken)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('a JPEG with a frame header but no scan: the tables and SOF, then EOI', () => {
    const bytes = fixture('canvas-chromium.jpg')
    const sos = markerAt(bytes, 0xda)
    expect(sos).toBeGreaterThan(0)
    const noScan = new Uint8Array([...bytes.subarray(0, sos), 0xff, 0xd9])
    expect(checkWallPhoto(noScan)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('a JPEG with no frame header at all (SOI straight to EOI)', () => {
    expect(checkWallPhoto(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9))).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })
})
