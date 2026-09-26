import 'server-only'
import { parseBuffer } from 'music-metadata'
import { sniffAudioType, type MarketingAssetAudioType } from './audio-type'
import { SNIFF_BYTES } from './image-type'
import { countMp3Seconds } from './mp3-frames'

export type AudioMeasure =
  | { type: MarketingAssetAudioType; durationSeconds: number }
  /**
   * `type`: not an MP3, M4A or WAV we take — including an ID3 tag in front of
   * AAC or FLAC, a non-PCM WAV, ALAC, video, or more than one audio track.
   * `unreadable`: an M4A or WAV of the right kind with no length to read.
   * Both refuse: an unknown length never passes the ten-minute cap.
   */
  | { refused: 'type' | 'unreadable' }

type Measured = number | { refused: 'type' | 'unreadable' }

/**
 * A track's format and length, from the file itself (spec §6). The rule is
 * to measure what a decoder will actually play, never a field the uploader
 * wrote:
 *
 *  - **MP3**: the MPEG Layer III frames actually present, counted here
 *    ({@link countMp3Seconds}). No Xing, LAME or VBRI header is read.
 *  - **WAV**: the data bytes actually present divided by the rate this code
 *    derives from sample rate × channels × bits ({@link measureWav}). Neither
 *    the data chunk's declared size nor the header's byte rate is trusted.
 *  - **M4A**: parsed with `music-metadata`, the one format whose length needs
 *    a real container parser. AAC only, no video, exactly one audio track.
 *    Known hole: its length is the movie header's; a crafted file whose
 *    header undersells its sample tables is bounded only by the 20 MB cap.
 *
 * Every path is linear in the file's size and never waits on a fetch.
 */
export async function measureAudio(bytes: Uint8Array): Promise<AudioMeasure> {
  const type = sniffAudioType(bytes.subarray(0, SNIFF_BYTES))
  if (!type) return { refused: 'type' }
  const measured: Measured =
    type === 'audio/wav'
      ? measureWav(bytes)
      : type === 'audio/mpeg'
        ? countMp3Seconds(bytes) || { refused: 'type' }
        : await measureM4a(bytes)
  if (typeof measured !== 'number') return measured
  return { type, durationSeconds: measured }
}

async function measureM4a(bytes: Uint8Array): Promise<Measured> {
  let format
  try {
    ;({ format } = await parseBuffer(
      bytes,
      { mimeType: 'audio/mp4', size: bytes.length },
      { skipCovers: true },
    ))
  } catch {
    // A file the parser cannot read at all is not an M4A we take, and a
    // throw here must not become the route's 500.
    return { refused: 'type' }
  }
  const audioTracks = (format.trackInfo ?? []).filter(
    (track) => track.type === 2,
  )
  if (
    !(format.codec ?? '').startsWith('MPEG-4/AAC') ||
    format.hasVideo ||
    // A second track plays for as long as it runs, whatever the first says.
    audioTracks.length > 1
  )
    return { refused: 'type' }
  const seconds = format.duration
  return seconds && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : { refused: 'unreadable' }
}

/** `KSDATAFORMAT_SUBTYPE_PCM`, as it sits in a WAVE_FORMAT_EXTENSIBLE header. */
const PCM_SUBFORMAT = [
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00,
  0x38, 0x9b, 0x71,
]

/**
 * A PCM WAV's length: every byte from the start of its data chunk to the end
 * of the file, over sample rate × channels × bytes per sample. A decoder reads
 * on past a data chunk that undersells itself, and the header's own byte rate
 * (`nAvgBytesPerSec`) is whatever the file says, so neither is used. Bytes
 * after the data (a trailing LIST chunk) count as audio, which can only
 * lengthen the reading. Plain PCM (format 1) and WAVE_FORMAT_EXTENSIBLE with
 * the PCM sub-format (what ffmpeg and DAWs write for 24-bit or more than two
 * channels) are taken; A-law, μ-law, float and every other codec are refused.
 */
export function measureWav(bytes: Uint8Array): Measured {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fmt: { channels: number; sampleRate: number; bits: number } | null = null
  let offset = 12
  // Each step moves past at least one 8-byte chunk header: linear.
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > bytes.length) return { refused: 'type' }
      const tag = view.getUint16(body, true)
      const extensiblePcm =
        tag === 0xfffe &&
        size >= 40 &&
        body + 40 <= bytes.length &&
        PCM_SUBFORMAT.every((b, i) => bytes[body + 24 + i] === b)
      if (tag !== 1 && !extensiblePcm) return { refused: 'type' }
      fmt = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      }
    } else if (id === 'data') {
      if (!fmt) return { refused: 'type' }
      const { channels, sampleRate, bits } = fmt
      if (![8, 16, 24, 32].includes(bits) || channels < 1 || sampleRate < 1)
        return { refused: 'type' }
      const present = bytes.length - body
      const seconds = present / (sampleRate * channels * (bits / 8))
      return seconds > 0 ? seconds : { refused: 'unreadable' }
    }
    offset = body + size + (size % 2)
  }
  return fmt ? { refused: 'unreadable' } : { refused: 'type' }
}
