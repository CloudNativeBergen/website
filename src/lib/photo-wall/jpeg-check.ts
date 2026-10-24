/**
 * THE JPEG CHECKS (Photo Wall spec §6.4), structural, on the bytes in memory:
 * no decoder. A marker walk from the SOI through every segment and the scan
 * data to the EOI, which must also be the last two bytes. Along the way: the
 * frame header's dimensions, and any segment that can carry metadata.
 *
 * An ALLOW-LIST, not a deny-list: a JPEG here is the SOI, then a plain JFIF
 * APP0 (optional, straight after the SOI), tables (DQT, DHT, DRI), exactly one
 * frame header (SOF0, SOF1 or SOF2: Huffman-coded, what canvas encoders write)
 * and one or more scans with tables between them, then the EOI. Restart
 * markers only inside scan data. Any other marker is refused, so no reserved
 * or unknown segment can carry what a lenient walk would skip.
 *
 * Metadata rule: no APPn except a plain JFIF APP0, and no COM, which covers
 * Exif and XMP (APP1), ICC profiles (APP2) and IPTC (APP13). The composer
 * strips them (§6.5), so their presence means the file didn't come from the
 * composer.
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
  /** A marker off the allow-list, as `FFxx`. */
  | { ok: false; reason: 'unexpectedMarker'; marker: string }

export type WallPhotoCheck =
  { ok: true; width: number; height: number } | WallPhotoRefusal

const SOI = 0xd8
const EOI = 0xd9
const SOS = 0xda
const DQT = 0xdb
const DHT = 0xc4
const DRI = 0xdd
const COM = 0xfe
const APP0 = 0xe0

/** SOF0 baseline, SOF1 extended sequential, SOF2 progressive (Huffman). */
const isFrameHeader = (marker: number) => marker >= 0xc0 && marker <= 0xc2

/** Every APPn but APP0, and COM: always metadata. */
const isMetadata = (marker: number) =>
  marker === COM || (marker >= 0xe1 && marker <= 0xef)

const isRestart = (marker: number) => marker >= 0xd0 && marker <= 0xd7

/** The markers with a segment this walk accepts, before the content checks. */
const isAllowed = (marker: number) =>
  marker === APP0 ||
  isMetadata(marker) ||
  isFrameHeader(marker) ||
  marker === DQT ||
  marker === DHT ||
  marker === DRI ||
  marker === SOS

const segmentName = (marker: number) =>
  marker === COM ? 'COM' : `APP${marker - APP0}`

const hex = (marker: number) =>
  `FF${marker.toString(16).toUpperCase().padStart(2, '0')}`

/** `JFIF\0` */
const JFIF = [0x4a, 0x46, 0x49, 0x46, 0x00]
/** JFIF\0, version (2), units, X and Y density (2 each), thumbnail size (2). */
const JFIF_HEADER = 14

/**
 * A JFIF APP0 and nothing else: the header with a 0 x 0 thumbnail and no
 * bytes after it. A thumbnail, a JFXX extension or any other APP0 payload can
 * carry a whole second image (with its own Exif).
 */
const isPlainJfif = (bytes: Uint8Array, payload: number, length: number) =>
  length === 2 + JFIF_HEADER &&
  JFIF.every((b, k) => bytes[payload + k] === b) &&
  bytes[payload + 12] === 0 &&
  bytes[payload + 13] === 0

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

  /** The one frame header. */
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
    if (inScan && (marker === 0x00 || isRestart(marker))) {
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
    // Before reading a length: a second SOI, a restart marker outside a scan,
    // TEM, DNL, a reserved or unknown marker all stop here.
    if (!isAllowed(marker)) {
      return { ok: false, reason: 'unexpectedMarker', marker: hex(marker) }
    }
    if (i + 3 >= bytes.length) return { ok: false, reason: 'truncated' }
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    if (length < 2) return { ok: false, reason: 'malformed' }
    const payload = i + 4
    const next = i + 2 + length
    if (next > bytes.length) return { ok: false, reason: 'truncated' }

    if (isMetadata(marker)) {
      return { ok: false, reason: 'metadata', segment: segmentName(marker) }
    } else if (marker === APP0) {
      // Only as the first segment, and only a plain JFIF header.
      if (i !== 2 || !isPlainJfif(bytes, payload, length)) {
        return { ok: false, reason: 'metadata', segment: 'APP0' }
      }
    } else if (isFrameHeader(marker)) {
      // One frame: a second one (a hierarchical file, or a huge first frame
      // before the real one) is not something the composer makes.
      if (frame) return { ok: false, reason: 'malformed' }
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
