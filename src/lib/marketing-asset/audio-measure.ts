import 'server-only'
import { sniffAudioType, type MarketingAssetAudioType } from './audio-type'
import { SNIFF_BYTES } from './image-type'
import { measureMp3 } from './mp3-frames'

export type AudioMeasure =
  | { type: MarketingAssetAudioType; durationSeconds: number }
  /**
   * `type`: not an MP3, M4A or WAV we can account for byte by byte — an ID3
   * tag in front of AAC or FLAC, a non-PCM WAV, ALAC, video, a second track,
   * a fragmented MP4, a malformed file. `unreadable`: an M4A or WAV of the
   * right kind with no length in it. Both refuse: an unknown length never
   * passes the ten-minute cap.
   */
  | { refused: 'type' | 'unreadable' }

type Measured = number | { refused: 'type' | 'unreadable' }

/**
 * A track's format and length, from the file itself (spec §6). The rule is
 * STRICT WHOLE-FILE VALIDATION: measure what a decoder will play, from the
 * structures it plays from, and refuse anything that cannot be accounted
 * for. No field the uploader wrote for the purpose — a Xing/LAME header, a
 * WAV byte rate or data size, an MP4 movie duration — is taken on trust.
 *
 *  - **MP3** ({@link measureMp3}): tags, then a chain of Layer III frames.
 *  - **WAV** ({@link measureWav}): one `fmt `, then one `data`; the length is
 *    the bytes present over sample rate × channels × bits ÷ 8.
 *  - **M4A** ({@link measureM4a}): one sound track; the length is the sum of
 *    its sample table (`stts`) over its timescale, cross-checked against the
 *    track header.
 *
 * No third-party parser: every path is this module's own, linear in the
 * file's size, and any throw inside is a refusal, never the route's 500.
 */
export async function measureAudio(bytes: Uint8Array): Promise<AudioMeasure> {
  const type = sniffAudioType(bytes.subarray(0, SNIFF_BYTES))
  if (!type) return { refused: 'type' }
  let measured: Measured
  try {
    measured =
      type === 'audio/wav'
        ? measureWav(bytes)
        : type === 'audio/mpeg'
          ? (measureMp3(bytes) ?? { refused: 'type' })
          : measureM4a(bytes)
  } catch {
    return { refused: 'type' }
  }
  if (typeof measured !== 'number') return measured
  return { type, durationSeconds: measured }
}

/** `KSDATAFORMAT_SUBTYPE_PCM`, as it sits in a WAVE_FORMAT_EXTENSIBLE header. */
const PCM_SUBFORMAT = [
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00,
  0x38, 0x9b, 0x71,
]

const fourcc = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4))

/**
 * A PCM WAV's length. Exactly one `fmt ` chunk, complete, before exactly one
 * `data` chunk; anything else is refused. The length is every byte from the
 * start of the data to the end of the file over sample rate × channels ×
 * bytes per sample: a decoder reads on past a data chunk that undersells
 * itself, and the header's own byte rate (`nAvgBytesPerSec`) is whatever the
 * file says, so neither is used. Plain PCM (format 1) and
 * WAVE_FORMAT_EXTENSIBLE with the PCM sub-format (what ffmpeg and DAWs write
 * for 24-bit or more than two channels) are taken.
 */
export function measureWav(bytes: Uint8Array): Measured {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fmt: { channels: number; sampleRate: number; bits: number } | null = null
  let dataStart: number | null = null
  // Each step moves past at least one 8-byte chunk header: linear.
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = fourcc(bytes, offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ') {
      if (fmt) return { refused: 'type' }
      if (size < 16 || body + size > bytes.length) return { refused: 'type' }
      const tag = view.getUint16(body, true)
      const extensiblePcm =
        tag === 0xfffe &&
        size >= 40 &&
        PCM_SUBFORMAT.every((b, i) => bytes[body + 24 + i] === b)
      if (tag !== 1 && !extensiblePcm) return { refused: 'type' }
      fmt = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      }
    } else if (id === 'data') {
      if (!fmt || dataStart !== null) return { refused: 'type' }
      dataStart = body
    }
    offset = body + size + (size % 2)
  }
  if (!fmt) return { refused: 'type' }
  if (dataStart === null) return { refused: 'unreadable' }
  const { channels, sampleRate, bits } = fmt
  if (![8, 16, 24, 32].includes(bits) || channels < 1 || sampleRate < 1)
    return { refused: 'type' }
  const seconds =
    (bytes.length - dataStart) / (sampleRate * channels * (bits / 8))
  return seconds > 0 ? seconds : { refused: 'unreadable' }
}

interface Box {
  type: string
  /** Where the box's payload starts and ends. */
  start: number
  end: number
}

/** The boxes in `[start, end)`; throws on one that runs past its parent. */
function boxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Box[] = []
  for (let offset = start; offset + 8 <= end;) {
    let size = view.getUint32(offset)
    let header = 8
    if (size === 1) {
      size = Number(view.getBigUint64(offset + 8))
      header = 16
    } else if (size === 0) size = end - offset
    if (size < header || offset + size > end) throw new Error('bad box')
    out.push({
      type: fourcc(bytes, offset + 4),
      start: offset + header,
      end: offset + size,
    })
    offset += size
  }
  return out
}

const child = (bytes: Uint8Array, box: Box | undefined, type: string) =>
  box
    ? boxes(bytes, box.start, box.end).find((b) => b.type === type)
    : undefined

/**
 * How far the sample table and the track header may disagree. Encoders write
 * the header FROM the table, so they match; a quarter-second covers rounding.
 */
const HEADER_SLACK_SECONDS = 0.25

/**
 * An M4A's length from its sample table. Refused: a fragmented MP4 (a `moof`
 * box — its samples are in fragments this does not walk), more than one
 * `moov`, anything but exactly ONE track, a sample description that is not
 * one `mp4a` entry (AAC; ALAC is refused), a sample table whose count
 * disagrees with the sample sizes, and a track header whose duration differs
 * from the sample table by more than {@link HEADER_SLACK_SECONDS}. The length
 * is the `stts` deltas summed over the media timescale: what a decoder times
 * the samples by.
 */
export function measureM4a(bytes: Uint8Array): Measured {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const top = boxes(bytes, 0, bytes.length)
  // The sniff has already seen `ftyp` first. A fragmented MP4 is refused
  // outright: its samples are in `moof` fragments this does not walk.
  if (top.some((b) => b.type === 'moof')) return { refused: 'type' }
  const moov = top.filter((b) => b.type === 'moov')
  if (moov.length !== 1) return { refused: 'type' }
  const inMoov = boxes(bytes, moov[0].start, moov[0].end)
  const traks = inMoov.filter((b) => b.type === 'trak')
  if (traks.length !== 1) return { refused: 'type' }
  const mdia = child(bytes, traks[0], 'mdia')
  const mdhd = child(bytes, mdia, 'mdhd')
  const stbl = child(bytes, child(bytes, mdia, 'minf'), 'stbl')
  const stsd = child(bytes, stbl, 'stsd')
  const stts = child(bytes, stbl, 'stts')
  const stsz = child(bytes, stbl, 'stsz')
  if (!mdhd || !stsd || !stts || !stsz) return { refused: 'type' }
  // One sample entry, and it is AAC (`mp4a`): a sound track by construction.
  if (view.getUint32(stsd.start + 4) !== 1) return { refused: 'type' }
  if (fourcc(bytes, stsd.start + 12) !== 'mp4a') return { refused: 'type' }

  const v1 = bytes[mdhd.start] === 1
  const timescale = view.getUint32(mdhd.start + (v1 ? 20 : 12))
  const headerDuration = v1
    ? Number(view.getBigUint64(mdhd.start + 24))
    : view.getUint32(mdhd.start + 16)
  if (timescale === 0) return { refused: 'type' }

  // A count past the box's end reads past the file and throws: a refusal.
  const entries = view.getUint32(stts.start + 4)
  let samples = 0
  let ticks = 0
  for (let i = 0; i < entries; i++) {
    const count = view.getUint32(stts.start + 8 + i * 8)
    const delta = view.getUint32(stts.start + 12 + i * 8)
    samples += count
    ticks += count * delta
  }
  if (view.getUint32(stsz.start + 8) !== samples) return { refused: 'type' }
  const seconds = ticks / timescale
  if (!(seconds > 0)) return { refused: 'unreadable' }
  if (Math.abs(seconds - headerDuration / timescale) > HEADER_SLACK_SECONDS)
    return { refused: 'type' }
  return seconds
}
