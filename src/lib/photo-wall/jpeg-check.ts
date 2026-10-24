/**
 * THE JPEG CHECKS (Photo Wall spec §6.4), structural, on the bytes in memory:
 * no decoder. A marker walk from the SOI through every segment and the scan
 * data to the EOI, which must also be the last two bytes. Along the way: the
 * frame header's dimensions, and any segment that can carry metadata.
 *
 * Metadata rule: no APPn except APP0 (JFIF) and no COM, which covers Exif and
 * XMP (APP1), ICC profiles (APP2) and IPTC (APP13). The composer strips them
 * (§6.5), so their presence means the file didn't come from the composer.
 *
 * Never throws on bad input: every malformed file is a refusal.
 */
import { sniffImageType } from '@/lib/marketing-asset/image-type'

/** 4 MiB (§6.4): the composer re-encodes to at most this. */
export const MAX_PHOTO_BYTES = 4_194_304
export const MAX_LONG_EDGE = 2048
export const MIN_SHORT_EDGE = 320

export type WallPhotoRefusal =
  | { ok: false; reason: 'size' }
  | { ok: false; reason: 'notJpeg' }
  /** No EOI where one is due: cut short, or bytes after the EOI. */
  | { ok: false; reason: 'truncated' }
  /** Not a JPEG this walk can follow (no frame header or scan, a bad length). */
  | { ok: false; reason: 'malformed' }
  | { ok: false; reason: 'longEdge'; width: number; height: number }
  | { ok: false; reason: 'shortEdge'; width: number; height: number }
  | { ok: false; reason: 'metadata'; segment: string }

export type WallPhotoCheck =
  { ok: true; width: number; height: number } | WallPhotoRefusal

const SOI = 0xd8
const EOI = 0xd9
const SOS = 0xda
const COM = 0xfe
const APP0 = 0xe0

/** SOF0–SOF15, less the three in that range that are not frame headers. */
const isFrameHeader = (marker: number) =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 && // DHT
  marker !== 0xc8 && // JPG (reserved)
  marker !== 0xcc // DAC

/** RST0–RST7 and TEM stand alone: no length, no payload. */
const isStandalone = (marker: number) =>
  (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01

const segmentName = (marker: number) =>
  marker === COM ? 'COM' : `APP${marker - APP0}`

interface Frame {
  width: number
  height: number
}

export function checkWallPhoto(bytes: Uint8Array): WallPhotoCheck {
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: 'size' }
  if (sniffImageType(bytes) !== 'image/jpeg') {
    return { ok: false, reason: 'notJpeg' }
  }
  if (bytes[1] !== SOI) return { ok: false, reason: 'malformed' }

  /** The frame header seen so far. */
  let frame: Frame | null = null
  /** The frame a scan was started for: a JPEG needs a frame AND a scan. */
  let scanned: Frame | null = null
  let i = 2
  let inScan = false
  for (;;) {
    if (i + 1 >= bytes.length) return { ok: false, reason: 'truncated' }
    if (bytes[i] !== 0xff) {
      if (inScan) {
        i++
        continue
      }
      return { ok: false, reason: 'malformed' }
    }
    const marker = bytes[i + 1]
    // Entropy-coded data: a stuffed 0xFF00 and a restart marker are data.
    if (inScan && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) {
      i += 2
      continue
    }
    if (marker === 0xff) {
      // Fill byte before a marker.
      i++
      continue
    }
    inScan = false
    if (marker === EOI) {
      if (i + 2 !== bytes.length) return { ok: false, reason: 'truncated' }
      if (!scanned) return { ok: false, reason: 'malformed' }
      const { width, height } = scanned
      const long = Math.max(width, height)
      const short = Math.min(width, height)
      if (long > MAX_LONG_EDGE) {
        return { ok: false, reason: 'longEdge', width, height }
      }
      if (short < MIN_SHORT_EDGE) {
        return { ok: false, reason: 'shortEdge', width, height }
      }
      return { ok: true, width, height }
    }
    if (isStandalone(marker)) {
      i += 2
      continue
    }
    if (i + 3 >= bytes.length) return { ok: false, reason: 'truncated' }
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    if (length < 2) return { ok: false, reason: 'malformed' }
    const payload = i + 4
    const next = i + 2 + length
    if (next > bytes.length) return { ok: false, reason: 'truncated' }

    if (marker === COM || (marker >= 0xe1 && marker <= 0xef)) {
      return { ok: false, reason: 'metadata', segment: segmentName(marker) }
    } else if (isFrameHeader(marker)) {
      if (length < 7) return { ok: false, reason: 'malformed' }
      const height = (bytes[payload + 1] << 8) | bytes[payload + 2]
      const width = (bytes[payload + 3] << 8) | bytes[payload + 4]
      // A height of 0 defers to a DNL marker; nothing the composer makes.
      if (width === 0 || height === 0) return { ok: false, reason: 'malformed' }
      frame = { width, height }
    } else if (marker === SOS) {
      scanned = frame
      inScan = true
    }
    i = next
  }
}
