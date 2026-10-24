/**
 * THE APPn STRIP (Photo Wall spec §6.5). Client-safe, pure bytes in and out:
 * no decoder, no DOM.
 *
 * `canvas.toBlob('image/jpeg')` already drops the camera's Exif, but Safari's
 * encoder writes an APP1 (Exif) and an APP13 (Photoshop/IPTC) of its own
 * (`__tests__/fixtures/photo-wall/webkit-canvas.jpg`). The server refuses any
 * APPn but APP0 and any COM (§6.4), so the composer walks the markers and
 * copies everything else through, byte for byte.
 */

const SOI = 0xd8
const EOI = 0xd9
const SOS = 0xda
const APP0 = 0xe0
const APP15 = 0xef
const COM = 0xfe

export interface JpegSegment {
  /** The marker's second byte: `0xe1` for APP1, `0xfe` for COM, `0xc0` for SOF0, ... */
  marker: number
  /** Where its `0xff` sits. */
  offset: number
  /** The segment's whole length on disk, marker included. */
  length: number
}

/** A marker that carries no length field and stands alone. */
const standalone = (marker: number) =>
  marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)

/**
 * The marker segments between SOI and SOS, in file order. Walks only the
 * header: from SOS on, the entropy-coded scan is opaque to this module. A
 * malformed header ends the walk at the last complete segment.
 */
export function listJpegSegments(bytes: Uint8Array): JpegSegment[] {
  const segments: JpegSegment[] = []
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== SOI) return segments
  let i = 2
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]
    // Fill bytes: a marker may be preceded by any number of 0xff.
    if (marker === 0xff) {
      i += 1
      continue
    }
    if (marker === SOS) break
    if (standalone(marker)) {
      segments.push({ marker, offset: i, length: 2 })
      i += 2
      continue
    }
    if (i + 3 >= bytes.length) break
    const length = 2 + ((bytes[i + 2] << 8) | bytes[i + 3])
    if (i + length > bytes.length) break
    segments.push({ marker, offset: i, length })
    i += length
  }
  return segments
}

const dropped = (marker: number) =>
  (marker > APP0 && marker <= APP15) || marker === COM

/**
 * The same JPEG without its APP1–APP15 and COM segments. Everything else
 * (APP0, the tables, SOF, DRI, the scan and EOI) is copied unchanged, so the
 * image decodes identically. Bytes that are not a JPEG come back as they are.
 */
export function stripJpegMetadata(
  bytes: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const segments = listJpegSegments(bytes)
  const toDrop = segments.filter((s) => dropped(s.marker))
  if (toDrop.length === 0) return bytes
  const out = new Uint8Array(
    bytes.length - toDrop.reduce((n, s) => n + s.length, 0),
  )
  let from = 0
  let to = 0
  for (const s of toDrop) {
    out.set(bytes.subarray(from, s.offset), to)
    to += s.offset - from
    from = s.offset + s.length
  }
  out.set(bytes.subarray(from), to)
  return out
}

/** Whether the bytes end with an EOI marker, as the server requires (§6.4). */
export function endsWithEoi(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 2 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === EOI
  )
}
