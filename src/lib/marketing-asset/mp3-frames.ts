/**
 * Counting MPEG Layer III frames (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6).
 * Dependency-free on purpose: a test runs it in a worker with a deadline, so
 * a walk that stops advancing fails the suite instead of hanging it.
 */

const MPEG1_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
]
const MPEG2_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
]
/** By version bits (0 = MPEG 2.5, 2 = MPEG 2, 3 = MPEG 1); 1 is reserved. */
const SAMPLE_RATES: Record<number, number[]> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000],
}

/**
 * The seconds of MPEG Layer III audio in `bytes`, summed over every frame
 * header actually present. Two linear passes:
 *
 *  1. Find the stream: the first frame whose next frame follows it exactly
 *     (or which ends the file). Random bytes in AAC or FLAC produce the odd
 *     frame-shaped header, almost never two in a row. No such pair: not an
 *     MP3, and the count is 0.
 *  2. From the start, count EVERY valid Layer III frame header, chained or
 *     not, of any MPEG version — a decoder resyncs over junk, so frames
 *     separated by junk bytes play and are counted too.
 *
 * An ID3v2 tag is skipped by its declared size (its payload can hold anything,
 * including bytes that look like frames); anything else that is not a frame is
 * skipped a byte at a time. No Xing, LAME or VBRI header is read, so none can
 * undersell the stream, and a false sync counted in junk can only lengthen the
 * reading, which refuses rather than admits.
 *
 * A free-format frame (bitrate index 0) declares no length. It is counted as
 * the frame it is and the walk steps one byte past its header, which can only
 * add a false sync or two: longer, never shorter. Known gap: Layer I and II frames are not counted, so a
 * file that switches layers reads short; whether Safari or Firefox would play
 * such frames after Layer III ones is unverified.
 */
export function countMp3Seconds(bytes: Uint8Array): number {
  let start = 0
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f)
    start = 10 + size + (bytes[5] & 0x10 ? 10 : 0)
  }
  let found = false
  for (let offset = start; offset + 4 <= bytes.length && !found;) {
    const frame = readLayer3Frame(bytes, offset)
    if (!frame) {
      offset++
      continue
    }
    const next = offset + Math.max(1, frame.length)
    const following = readLayer3Frame(bytes, next) !== null
    if (next === bytes.length || following) found = true
    else offset++
  }
  if (!found) return 0
  let seconds = 0
  for (let offset = start; offset + 4 <= bytes.length;) {
    const frame = readLayer3Frame(bytes, offset)
    if (frame) {
      seconds += frame.seconds
      // A free-format frame's length is 0 (or 1, its padding): step past.
      offset += Math.max(1, frame.length)
    } else offset++
  }
  return seconds
}

function readLayer3Frame(
  bytes: Uint8Array,
  offset: number,
): { length: number; seconds: number } | null {
  const [b0, b1, b2] = [bytes[offset], bytes[offset + 1], bytes[offset + 2]]
  // Frame sync, and layer bits 01 (Layer III).
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0 || (b1 & 0x06) !== 0x02) return null
  const version = (b1 >> 3) & 0x03
  const rates = SAMPLE_RATES[version]
  const bitrateIndex = b2 >> 4
  const rateIndex = (b2 >> 2) & 0x03
  if (!rates || bitrateIndex === 15 || rateIndex === 3) return null
  const mpeg1 = version === 3
  const bitrate = (mpeg1 ? MPEG1_BITRATES : MPEG2_BITRATES)[bitrateIndex] * 1000
  const sampleRate = rates[rateIndex]
  const samples = mpeg1 ? 1152 : 576
  const length =
    Math.floor(((samples / 8) * bitrate) / sampleRate) + ((b2 >> 1) & 0x01)
  return { length, seconds: samples / sampleRate }
}
