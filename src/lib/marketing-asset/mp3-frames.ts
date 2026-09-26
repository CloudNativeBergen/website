/**
 * Strict MP3 validation and length (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6).
 * Dependency-free on purpose: a test runs it in a worker with a deadline, so
 * a walk that stops advancing fails the suite instead of hanging it.
 *
 * A file is accepted only when every byte is accounted for, as a decoder will
 * read it:
 *
 *   [ID3v2 tag, by its declared size and footer]
 *   + a CHAIN of MPEG-1/2/2.5 Layer III frames, each header followed by the
 *     next at exactly its computed length — the way a decoder walks — the
 *     last ending at the trailer, all of ONE stream (the version and sample
 *     rate of the first; a frame of another is unaccounted)
 *   + [APEv2 tag] + [ID3v1 tag]
 *
 * with at most {@link MAX_UNACCOUNTED_BYTES} not accounted for (a partial last
 * frame, a Lyrics3 tag, encoder padding). A header whose successor does not
 * follow is not a frame. The length is the chain's frames × samples per frame
 * ÷ sample rate; no Xing, LAME or VBRI header is read.
 */

/** Far below any meaningful audio: 4 KB is a quarter-second at 128 kbit/s. */
export const MAX_UNACCOUNTED_BYTES = 4096

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
/** The smallest real Layer III frame is 24 bytes (MPEG 2.5, 8 kbit/s). */
const MIN_FRAME_BYTES = 24

interface Frame {
  length: number
  seconds: number
  /** Version and sample rate: what every frame of one stream shares. */
  stream: number
}

/** The bytes the tags at either end hold: `[start, end)` is the audio. */
function audioBounds(bytes: Uint8Array): { start: number; end: number } {
  let start = 0
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f)
    start = 10 + size + (bytes[5] & 0x10 ? 10 : 0)
  }
  let end = bytes.length
  const at = (offset: number, text: string) =>
    offset >= 0 &&
    [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0))
  if (at(end - 128, 'TAG')) end -= 128
  if (at(end - 32, 'APETAGEX')) {
    const footer = end - 32
    const size =
      bytes[footer + 12] |
      (bytes[footer + 13] << 8) |
      (bytes[footer + 14] << 16) |
      (bytes[footer + 15] << 24)
    const hasHeader = (bytes[footer + 23] & 0x80) !== 0
    end = Math.max(start, end - size - (hasHeader ? 32 : 0))
  }
  return { start: Math.min(start, end), end }
}

/**
 * The file's Layer III length in seconds, or null when it is not a file of
 * such frames with every byte accounted for.
 */
export function measureMp3(bytes: Uint8Array): number | null {
  const { start, end } = audioBounds(bytes)
  let unaccounted = 0
  let seconds = 0
  let frames = 0
  let stream: number | null = null
  for (let offset = start; offset < end;) {
    const frame = readLayer3Frame(bytes, offset, end)
    const next = frame ? offset + frame.length : -1
    const chained =
      frame !== null &&
      (stream === null || frame.stream === stream) &&
      next <= end &&
      (next === end || readLayer3Frame(bytes, next, end) !== null)
    if (chained) {
      stream = frame.stream
      seconds += frame.seconds
      frames++
      offset = next
    } else {
      if (++unaccounted > MAX_UNACCOUNTED_BYTES) return null
      offset++
    }
  }
  return frames > 0 ? seconds : null
}

function readLayer3Frame(
  bytes: Uint8Array,
  offset: number,
  end: number,
): Frame | null {
  if (offset + 4 > end) return null
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
  // A free-format frame (bitrate index 0) declares no length the walk could
  // follow: not a frame.
  if (length < MIN_FRAME_BYTES) return null
  return {
    length,
    seconds: samples / sampleRate,
    stream: version * 4 + rateIndex,
  }
}
