import 'server-only'
import { parseBuffer } from 'music-metadata'
import type { MarketingAssetAudioType } from './audio-type'

/**
 * What the parsed file must be for each sniffed type: the sniff reads a few
 * bytes, and an ID3 tag can sit in front of AAC or FLAC as easily as MP3. A
 * WAV must be PCM (A-law, μ-law and float WAVs are refused: their length
 * comes from a `fact` chunk the file can set to anything, and browsers decode
 * them unevenly). An M4A must be AAC, with no video.
 */
const MATCHES: Record<
  MarketingAssetAudioType,
  (format: { container?: string; codec?: string }) => boolean
> = {
  'audio/mpeg': ({ container, codec }) =>
    container === 'MPEG' && /Layer 3$/.test(codec ?? ''),
  'audio/wav': ({ container, codec }) =>
    container === 'WAVE' && codec === 'PCM',
  'audio/mp4': ({ codec }) => (codec ?? '').startsWith('MPEG-4/AAC'),
}

export type AudioMeasure =
  | { durationSeconds: number }
  /**
   * `type`: not a track of the sniffed format (an MP4 holding video, AAC or
   * FLAC behind an ID3 tag, a non-PCM WAV). `unreadable`: the format matches
   * but no length could be read from it. Both refuse: an unknown length is
   * never let through the ten-minute cap.
   */
  | { refused: 'type' | 'unreadable' }

/**
 * A track's length in seconds, measured from the file itself (spec §6).
 *
 * An MP3's length is counted from the MPEG frames actually present
 * ({@link countMp3Seconds}), never from a Xing, LAME or VBRI header: the
 * parser trusts those without scanning, so a 16 MB file that plays for an
 * hour could claim two seconds. A PCM WAV is measured by the larger of its
 * header's length and the bytes it holds, since a decoder reads on past a data
 * chunk that undersells itself.
 *
 * Known hole: an M4A is measured by its movie header. A crafted file whose
 * header lies about its sample tables is not caught here; the file is still
 * bounded by the 20 MB cap.
 */
export async function measureAudio(
  bytes: Uint8Array,
  type: MarketingAssetAudioType,
): Promise<AudioMeasure> {
  let format
  try {
    ;({ format } = await parseBuffer(
      bytes,
      { mimeType: type, size: bytes.length },
      { duration: true, skipCovers: true },
    ))
  } catch {
    return { refused: 'type' }
  }
  if (!MATCHES[type](format)) return { refused: 'type' }
  if (format.hasVideo || format.hasAudio === false) return { refused: 'type' }
  let seconds = format.duration
  if (type === 'audio/mpeg') seconds = countMp3Seconds(bytes)
  if (type === 'audio/wav' && format.bitrate)
    seconds = Math.max(seconds ?? 0, (bytes.length * 8) / format.bitrate)
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0)
    return { refused: 'unreadable' }
  return { durationSeconds: seconds }
}

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
 * The seconds of MPEG Layer III audio in `bytes`, summed frame by frame over
 * every frame header actually present. Tags are skipped as bytes that are not
 * frames: an ID3v2 tag by its declared size, anything else by scanning to the
 * next frame sync. A free-format frame (bitrate index 0) has no length it can
 * be walked by, and is skipped the same way. Every frame found counts, so a
 * header that undersells the stream changes nothing, and a false sync inside
 * junk can only lengthen the count, which refuses rather than admits.
 */
export function countMp3Seconds(bytes: Uint8Array): number {
  let offset = 0
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f)
    offset = 10 + size + (bytes[5] & 0x10 ? 10 : 0)
  }
  let seconds = 0
  while (offset + 4 <= bytes.length) {
    const frame = readLayer3Frame(bytes, offset)
    if (!frame) {
      offset++
      continue
    }
    seconds += frame.seconds
    offset += frame.length
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
  if (!rates || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3)
    return null
  const mpeg1 = version === 3
  const bitrate = (mpeg1 ? MPEG1_BITRATES : MPEG2_BITRATES)[bitrateIndex] * 1000
  const sampleRate = rates[rateIndex]
  const padding = (b2 >> 1) & 0x01
  const samples = mpeg1 ? 1152 : 576
  const length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding
  return { length, seconds: samples / sampleRate }
}
