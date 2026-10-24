import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { endsWithEoi, listJpegSegments, stripJpegMetadata } from './jpeg-strip'

/**
 * The composer's APPn strip (Photo Wall spec §6.5): after `toBlob`, every
 * APPn segment except APP0 and every COM segment leave the bytes, so the
 * server's no-metadata rule (§6.4) accepts what Safari's encoder wrote.
 */
const webkitCanvas = new Uint8Array(
  readFileSync(
    new URL(
      '../../../__tests__/fixtures/photo-wall/webkit-canvas.jpg',
      import.meta.url,
    ),
  ),
)

const markersOf = (bytes: Uint8Array) =>
  listJpegSegments(bytes).map((s) => s.marker)

describe('stripJpegMetadata on the WebKit canvas sample', () => {
  it('the sample itself carries APP1 and APP13: the strip has work to do', () => {
    expect(markersOf(webkitCanvas)).toEqual(
      expect.arrayContaining([0xe1, 0xed]),
    )
  })

  it('leaves no APPn but APP0 and no COM, and keeps SOI and EOI', () => {
    const out = stripJpegMetadata(webkitCanvas)
    const markers = markersOf(out)
    expect(markers.filter((m) => m >= 0xe1 && m <= 0xef)).toEqual([])
    expect(markers).not.toContain(0xfe)
    expect(markers).toContain(0xe0)
    expect([out[0], out[1]]).toEqual([0xff, 0xd8])
    expect([out.at(-2), out.at(-1)]).toEqual([0xff, 0xd9])
  })

  it('is otherwise byte-identical: the kept segments and the scan are copied through', () => {
    const out = stripJpegMetadata(webkitCanvas)
    const kept = listJpegSegments(webkitCanvas).filter(
      (s) => !(s.marker >= 0xe1 && s.marker <= 0xef) && s.marker !== 0xfe,
    )
    const outSegments = listJpegSegments(out)
    expect(outSegments.map((s) => s.marker)).toEqual(kept.map((s) => s.marker))
    kept.forEach((s, i) => {
      expect(
        out.subarray(outSegments[i].offset, outSegments[i].offset + s.length),
      ).toEqual(webkitCanvas.subarray(s.offset, s.offset + s.length))
    })
    // From SOS to EOI, the scan is untouched.
    const sosIn =
      webkitCanvas.indexOf(0xda, kept.at(-1)!.offset + kept.at(-1)!.length) - 1
    const sosOut = outSegments.at(-1)!.offset + outSegments.at(-1)!.length
    expect(out.subarray(sosOut)).toEqual(webkitCanvas.subarray(sosIn))
    expect(out.length).toBe(webkitCanvas.length - 78 - 58)
  })
})

/** A JPEG header built by hand: SOI, then the given segments, then a scan and EOI. */
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 0xff,
  ...payload,
]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const app0 = segment(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
const app1 = segment(0xe1, [
  ...ascii('Exif\0\0'),
  0x4d,
  0x4d,
  0,
  0x2a,
  0,
  0,
  0,
  8,
])
const dqt = segment(0xdb, [0, ...Array.from({ length: 64 }, (_, i) => i + 1)])
const app13 = segment(0xed, [
  ...ascii('Photoshop 3.0\0'),
  0x38,
  0x42,
  0x49,
  0x4d,
])
const sof0 = segment(0xc0, [8, 0x02, 0x00, 0x03, 0x00, 1, 1, 0x11, 0])
const com = segment(0xfe, ascii('shot at 60.39N 5.32E'))
const dht = segment(0xc4, [0, ...Array(16).fill(0), 0])
const scan = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, 0x34, 0xff, 0x00, 0x56]
const synthetic = new Uint8Array([
  0xff,
  0xd8,
  ...app0,
  ...app1,
  ...dqt,
  ...app13,
  ...sof0,
  ...com,
  ...dht,
  ...scan,
  0xff,
  0xd9,
])

describe('stripJpegMetadata on a synthetic JPEG with APP1, APP13 and COM', () => {
  it('drops exactly those three and keeps the rest in order', () => {
    const out = stripJpegMetadata(synthetic)
    expect(out).toEqual(
      new Uint8Array([
        0xff,
        0xd8,
        ...app0,
        ...dqt,
        ...sof0,
        ...dht,
        ...scan,
        0xff,
        0xd9,
      ]),
    )
    expect(markersOf(out)).toEqual([0xe0, 0xdb, 0xc0, 0xc4])
    expect(endsWithEoi(out)).toBe(true)
  })

  it('keeps a JPEG with nothing to strip as the same bytes', () => {
    const clean = new Uint8Array([
      0xff,
      0xd8,
      ...app0,
      ...dqt,
      ...sof0,
      ...dht,
      ...scan,
      0xff,
      0xd9,
    ])
    expect(stripJpegMetadata(clean)).toBe(clean)
  })

  it('walks past fill bytes before a marker', () => {
    const padded = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      ...app1,
      0xff,
      0xff,
      ...dqt,
      ...scan,
      0xff,
      0xd9,
    ])
    expect(markersOf(stripJpegMetadata(padded))).toEqual([0xdb])
  })

  it('does not touch an APP1-looking byte pattern inside the scan', () => {
    const bytes = new Uint8Array([
      0xff,
      0xd8,
      ...app0,
      ...sof0,
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
      0xff,
      0xe1,
      0x00,
      0x02,
      0xff,
      0xd9,
    ])
    expect(stripJpegMetadata(bytes)).toBe(bytes)
  })

  it('hands back bytes that are not a JPEG unchanged', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(stripJpegMetadata(png)).toBe(png)
    expect(listJpegSegments(png)).toEqual([])
    expect(endsWithEoi(png)).toBe(false)
  })

  it('stops at a segment whose length runs past the end instead of throwing', () => {
    const truncated = new Uint8Array([
      0xff,
      0xd8,
      ...app0,
      0xff,
      0xe1,
      0xff,
      0xff,
      1,
      2,
    ])
    expect(markersOf(truncated)).toEqual([0xe0])
    expect(stripJpegMetadata(truncated)).toBe(truncated)
  })
})
