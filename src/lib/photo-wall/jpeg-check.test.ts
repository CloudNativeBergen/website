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
 * - Crafted by `make-crafted-fixtures.py` (Pillow re-reads each one to prove
 *   the metadata is really in it): `embedded-soi.jpg` (an Exif APP1 hidden
 *   behind a second SOI), `multiframe-huge-first.jpg` (a 30000 x 30000 frame
 *   before the real one), `unknown-marker.jpg` (text in a JPG0 segment),
 *   `app0-exif.jpg`, `app0-jfxx.jpg`, `jfif-thumbnail.jpg`,
 *   `jfif-trailing.jpg` (an APP0 that is not plain JFIF), and the two Pillow
 *   files that must pass: `progressive.jpg` and `restart-markers.jpg`.
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

  it('a progressive JPEG: SOF2, many scans, Huffman tables between them', () => {
    expect(checkWallPhoto(fixture('progressive.jpg'))).toEqual({
      ok: true,
      width: 640,
      height: 480,
    })
  })

  it('a baseline JPEG with a restart interval and restart markers in its scan', () => {
    const bytes = fixture('restart-markers.jpg')
    expect(markerAt(bytes, 0xdd)).toBeGreaterThan(0)
    expect(markerAt(bytes, 0xd0)).toBeGreaterThan(markerAt(bytes, 0xda))
    expect(checkWallPhoto(bytes)).toEqual({ ok: true, width: 640, height: 480 })
  })

  it('an extended sequential frame header (SOF1), which canvas encoders may write', () => {
    const bytes = fixture('canvas-chromium.jpg').slice()
    bytes[markerAt(bytes, 0xc0) + 1] = 0xc1
    expect(checkWallPhoto(bytes)).toEqual({ ok: true, width: 640, height: 480 })
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

  it('a second SOI, whose two following bytes a lenient walk would take as a length and skip the Exif behind them', () => {
    expect(checkWallPhoto(fixture('embedded-soi.jpg'))).toEqual({
      ok: false,
      reason: 'unexpectedMarker',
      marker: 'FFD8',
    })
  })

  it('a second frame header, even one after a scan: the first one is 30000 x 30000', () => {
    expect(checkWallPhoto(fixture('multiframe-huge-first.jpg'))).toEqual({
      ok: false,
      reason: 'malformed',
    })
    // Back to back, before any scan.
    const bytes = fixture('canvas-chromium.jpg')
    const sof = markerAt(bytes, 0xc0)
    const sofEnd = sof + 2 + ((bytes[sof + 2] << 8) | bytes[sof + 3])
    const twice = new Uint8Array([
      ...bytes.subarray(0, sofEnd),
      ...bytes.subarray(sof, sofEnd),
      ...bytes.subarray(sofEnd),
    ])
    expect(checkWallPhoto(twice)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('every marker off the allow-list, carrying text where a lenient walk would skip it', () => {
    const bytes = fixture('unknown-marker.jpg')
    const at = markerAt(bytes, 0xf0)
    expect(at).toBeGreaterThan(0)
    // JPGn, reserved, JPG, DAC, DNL, DHP, EXP, TEM, a restart marker outside
    // a scan, SOI, and the frame types no canvas writes (lossless,
    // hierarchical, arithmetic).
    const offList = [
      0xf0, 0xfd, 0x02, 0xbf, 0xc8, 0xcc, 0xdc, 0xde, 0xdf, 0x01, 0xd0, 0xd8,
      0xc3, 0xc5, 0xc9, 0xcf,
    ]
    for (const marker of offList) {
      const renamed = bytes.slice()
      renamed[at + 1] = marker
      const hex = marker.toString(16).toUpperCase().padStart(2, '0')
      expect(checkWallPhoto(renamed)).toEqual({
        ok: false,
        reason: 'unexpectedMarker',
        marker: `FF${hex}`,
      })
    }
    // The real frame header renamed to a lossless one.
    const lossless = fixture('canvas-chromium.jpg').slice()
    lossless[markerAt(lossless, 0xc0) + 1] = 0xc3
    expect(checkWallPhoto(lossless)).toEqual({
      ok: false,
      reason: 'unexpectedMarker',
      marker: 'FFC3',
    })
  })

  it('an APP0 that is not JFIF: raw Exif with a GPS IFD in it', () => {
    expect(checkWallPhoto(fixture('app0-exif.jpg'))).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'APP0',
    })
  })

  it('a JFXX APP0 whose thumbnail is a whole camera JPEG with GPS', () => {
    expect(checkWallPhoto(fixture('app0-jfxx.jpg'))).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'APP0',
    })
  })

  it('a JFIF APP0 with a thumbnail, or with bytes after its header', () => {
    for (const name of ['jfif-thumbnail.jpg', 'jfif-trailing.jpg']) {
      expect(checkWallPhoto(fixture(name))).toEqual({
        ok: false,
        reason: 'metadata',
        segment: 'APP0',
      })
    }
  })

  it('an APP0 of JFIF’s length under another identifier', () => {
    const bytes = fixture('canvas-chromium.jpg').slice()
    bytes.set([0x4a, 0x46, 0x58, 0x58, 0x00], 6) // JFXX\0 over JFIF\0
    expect(checkWallPhoto(bytes)).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'APP0',
    })
  })

  it('a JFIF header that claims a thumbnail it does not carry, in either dimension', () => {
    // Bytes 18 and 19: the APP0's Xthumb and Ythumb.
    for (const at of [18, 19]) {
      const bytes = fixture('canvas-chromium.jpg').slice()
      expect(bytes[at]).toBe(0)
      bytes[at] = 1
      expect(checkWallPhoto(bytes)).toEqual({
        ok: false,
        reason: 'metadata',
        segment: 'APP0',
      })
    }
  })

  it('a plain JFIF APP0 anywhere but straight after the SOI', () => {
    const bytes = fixture('canvas-chromium.jpg')
    const app0 = bytes.subarray(2, 2 + 18)
    const dqt = markerAt(bytes, 0xdb)
    const late = new Uint8Array([
      ...bytes.subarray(0, dqt),
      ...app0,
      ...bytes.subarray(dqt),
    ])
    expect(checkWallPhoto(late)).toEqual({
      ok: false,
      reason: 'metadata',
      segment: 'APP0',
    })
  })

  it('a frame header that is not 8-bit with 1 or 3 components, or whose length does not match', () => {
    const canvas = fixture('canvas-chromium.jpg')
    const sof = markerAt(canvas, 0xc0)
    expect(sof).toBeGreaterThan(0)
    const edited = (edit: (bytes: Uint8Array) => void) => {
      const bytes = canvas.slice()
      edit(bytes)
      return checkWallPhoto(bytes)
    }
    // 12- and 16-bit precision: Safari decodes 12-bit, Chrome does not, so an
    // organizer could approve a photo the wall can't show.
    for (const precision of [0, 12, 16]) {
      expect(edited((b) => (b[sof + 4] = precision))).toEqual({
        ok: false,
        reason: 'malformed',
      })
    }
    // No components, or 2 or 4 (the composer makes 3).
    for (const components of [0, 2, 4]) {
      expect(edited((b) => (b[sof + 9] = components))).toEqual({
        ok: false,
        reason: 'malformed',
      })
    }
    // Four components with a header of exactly that length (CMYK-like):
    // consistent, but not something the composer makes.
    const sofLength = (canvas[sof + 2] << 8) | canvas[sof + 3]
    const sofEnd = sof + 2 + sofLength
    const four = new Uint8Array(canvas.length + 3)
    four.set(canvas.subarray(0, sofEnd))
    four.set([4, 0x11, 1], sofEnd)
    four.set(canvas.subarray(sofEnd), sofEnd + 3)
    four[sof + 3] = sofLength + 3
    four[sof + 9] = 4
    expect(checkWallPhoto(four)).toEqual({ ok: false, reason: 'malformed' })
    // Three extra bytes smuggled inside the frame header, its length grown to
    // carry them: every segment boundary still lines up.
    const length = (canvas[sof + 2] << 8) | canvas[sof + 3]
    const end = sof + 2 + length
    const smuggled = new Uint8Array(canvas.length + 3)
    smuggled.set(canvas.subarray(0, end))
    smuggled.set([0x47, 0x50, 0x53], end)
    smuggled.set(canvas.subarray(end), end + 3)
    smuggled[sof + 3] = length + 3
    expect(checkWallPhoto(smuggled)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('a byte between two segments, outside any scan', () => {
    const canvas = fixture('canvas-chromium.jpg')
    const dqt = markerAt(canvas, 0xdb)
    const bytes = new Uint8Array(canvas.length + 1)
    bytes.set(canvas.subarray(0, dqt))
    bytes[dqt] = 0x41
    bytes.set(canvas.subarray(dqt), dqt + 1)
    expect(checkWallPhoto(bytes)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('a JPEG with no frame header at all (SOI straight to EOI)', () => {
    expect(checkWallPhoto(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9))).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })
})
