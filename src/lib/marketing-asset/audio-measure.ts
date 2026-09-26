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
   * right kind with no length in it. `wav-format`: a WAV of a codec or shape
   * we do not take, so the organizer can be told how to export it. All
   * refuse: an unknown length never passes the ten-minute cap.
   */
  | { refused: Refusal }

type Refusal = 'type' | 'wav-format' | 'unreadable'
type Measured = number | { refused: Refusal }

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

/**
 * A WAVE_FORMAT_EXTENSIBLE sub-format GUID after its first two bytes, which
 * are the format code: `KSDATAFORMAT_SUBTYPE_PCM` is code 1, `…_IEEE_FLOAT`
 * code 3, both with this tail.
 */
const SUBFORMAT_TAIL = [
  0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b,
  0x71,
]

/** Bits per sample a WAV of each format code may carry. */
const WAV_BITS: Record<number, number[]> = {
  1: [8, 16, 24, 32], // PCM
  3: [32, 64], // IEEE float, what DAWs export
}

const fourcc = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4))

/** A RIFF chunk id is four printable ASCII characters. */
const isChunkId = (bytes: Uint8Array, offset: number) =>
  [0, 1, 2, 3].every(
    (i) => bytes[offset + i] >= 0x20 && bytes[offset + i] <= 0x7e,
  )

/**
 * A PCM or float WAV's length. The file must tile exactly into chunks:
 * exactly one complete `fmt ` before exactly one `data`, any others (`LIST`,
 * `id3 `) whole, and nothing left over. Only the `data` chunk is audio: its
 * bytes present over sample rate × channels × bytes per sample. The header's
 * byte rate (`nAvgBytesPerSec`) is never used. A data chunk that undersells
 * the samples after it does not tile, and is refused; one that oversells (a
 * streamed file's 0xFFFFFFFF) must be the last chunk, and counts to the end.
 * PCM (format 1), IEEE float (3), and WAVE_FORMAT_EXTENSIBLE with either
 * sub-format are taken; A-law, μ-law, ADPCM and the rest are refused.
 */
export function measureWav(bytes: Uint8Array): Measured {
  const refused = { refused: 'wav-format' } as const
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fmt: {
    code: number
    channels: number
    sampleRate: number
    bits: number
  } | null = null
  let dataBytes: number | null = null
  let offset = 12
  // Each step moves past at least one 8-byte chunk header: linear.
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length || !isChunkId(bytes, offset)) return refused
    const id = fourcc(bytes, offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    const whole = body + size <= bytes.length
    if (id === 'fmt ') {
      if (fmt || size < 16 || !whole) return refused
      let code = view.getUint16(body, true)
      if (code === 0xfffe) {
        const guid = body + 24
        if (
          size < 40 ||
          bytes[guid + 1] !== 0 ||
          !SUBFORMAT_TAIL.every((b, i) => bytes[guid + 2 + i] === b)
        )
          return refused
        code = bytes[guid]
      }
      fmt = {
        code,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      }
      if (!WAV_BITS[code]?.includes(fmt.bits)) return refused
    } else if (id === 'data') {
      if (!fmt || dataBytes !== null) return refused
      // An oversized (streamed) data chunk runs to the end: nothing follows.
      dataBytes = Math.min(size, bytes.length - body)
    } else if (!whole) return refused
    offset = body + size + (size % 2)
  }
  if (!fmt) return refused
  if (dataBytes === null) return { refused: 'unreadable' }
  const { channels, sampleRate, bits } = fmt
  if (channels < 1 || sampleRate < 1) return refused
  const seconds = dataBytes / (sampleRate * channels * (bits / 8))
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
 * the header FROM the table, so they match; a quarter-second covers the
 * shorter last frame.
 */
const HEADER_SLACK_SECONDS = 0.25

/** PCM samples one AAC-LC frame (one `stts` sample) decodes to. */
const AAC_FRAME = 1024

/** `samplingFrequencyIndex` → Hz (ISO 14496-3). */
const AAC_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
  8000, 7350,
]

/**
 * The AAC decoder config (AudioSpecificConfig) inside an `mp4a` entry's
 * `esds`: its audio object type and sample rate — what a decoder actually
 * plays at, whatever the entry's own rate field says. Null when absent.
 */
function aacConfig(
  bytes: Uint8Array,
  entry: Box,
): { objectType: number; sampleRate: number } | null {
  // An AudioSampleEntry's fixed fields are 28 bytes; its boxes follow.
  const esds = boxes(bytes, entry.start + 28, entry.end).find(
    (b) => b.type === 'esds',
  )
  if (!esds) return null
  let at = esds.start + 4 // version and flags
  /** One descriptor's tag, and where its payload starts and ends. */
  const descriptor = () => {
    const tag = bytes[at++]
    let size = 0
    for (let i = 0; i < 4; i++) {
      const b = bytes[at++]
      size = (size << 7) | (b & 0x7f)
      if (!(b & 0x80)) break
    }
    const start = at
    if (start + size > esds.end) throw new Error('bad descriptor')
    return { tag, start, end: start + size }
  }
  const es = descriptor()
  if (es.tag !== 0x03) return null
  const flags = bytes[at + 2]
  at += 3
  if (flags & 0x80) at += 2
  if (flags & 0x40) at += 1 + bytes[at]
  if (flags & 0x20) at += 2
  const config = descriptor()
  if (config.tag !== 0x04 || bytes[config.start] !== 0x40) return null
  at = config.start + 13
  const info = descriptor()
  if (info.tag !== 0x05 || info.end - info.start < 2) return null
  const objectType = bytes[info.start] >> 3
  const index = ((bytes[info.start] & 0x07) << 1) | (bytes[info.start + 1] >> 7)
  const sampleRate = AAC_RATES[index]
  return sampleRate ? { objectType, sampleRate } : null
}

/**
 * An M4A's length, from what its decoder plays. Refused: a fragmented MP4 (a
 * `moof` box — its samples are in fragments this does not walk), more than
 * one `moov`, a video track, anything but exactly ONE sound track (a chapter
 * or other text track beside it is fine), a sample description that is not
 * one `mp4a` entry, an AAC config that is not AAC-LC (HE-AAC is refused), a
 * media timescale that is not the rate the decoder config plays at, a sample
 * table whose count disagrees with the sample sizes, and a track header that
 * differs from the length by more than {@link HEADER_SLACK_SECONDS}. The
 * length is what the decoder produces: samples × 1024 ÷ the decoder's rate.
 * No `stts` delta is used, so none can undersell it. Known gap: an `elst`
 * edit list (which a player may use to trim priming) is not read.
 */
export function measureM4a(bytes: Uint8Array): Measured {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const top = boxes(bytes, 0, bytes.length)
  // The sniff has already seen `ftyp` first.
  if (top.some((b) => b.type === 'moof')) return { refused: 'type' }
  const moov = top.filter((b) => b.type === 'moov')
  if (moov.length !== 1) return { refused: 'type' }
  const tracks = boxes(bytes, moov[0].start, moov[0].end)
    .filter((b) => b.type === 'trak')
    .map((trak) => {
      const mdia = child(bytes, trak, 'mdia')
      const hdlr = child(bytes, mdia, 'hdlr')
      return { mdia, handler: hdlr ? fourcc(bytes, hdlr.start + 8) : null }
    })
  if (tracks.some((t) => t.handler === 'vide')) return { refused: 'type' }
  const sound = tracks.filter((t) => t.handler === 'soun')
  if (sound.length !== 1) return { refused: 'type' }
  const mdia = sound[0].mdia
  const mdhd = child(bytes, mdia, 'mdhd')
  const stbl = child(bytes, child(bytes, mdia, 'minf'), 'stbl')
  const stsd = child(bytes, stbl, 'stsd')
  const stts = child(bytes, stbl, 'stts')
  const stsz = child(bytes, stbl, 'stsz')
  if (!mdhd || !stsd || !stts || !stsz) return { refused: 'type' }
  // One sample entry, and it is AAC (`mp4a`).
  if (view.getUint32(stsd.start + 4) !== 1) return { refused: 'type' }
  const [entry] = boxes(bytes, stsd.start + 8, stsd.end)
  if (entry?.type !== 'mp4a') return { refused: 'type' }
  // AAC-LC, with a decoder config (HE-AAC and a missing config refused).
  const aac = aacConfig(bytes, entry)
  if (aac?.objectType !== 2) return { refused: 'type' }

  const v1 = bytes[mdhd.start] === 1
  const timescale = view.getUint32(mdhd.start + (v1 ? 20 : 12))
  const headerDuration = v1
    ? Number(view.getBigUint64(mdhd.start + 24))
    : view.getUint32(mdhd.start + 16)
  // The clock the samples are timed by must be the rate they play at.
  if (timescale !== aac.sampleRate) return { refused: 'type' }

  // A count past the box's end reads past the file and throws: a refusal.
  // Only the sample COUNTS are used: every AAC-LC sample decodes to one
  // 1024-sample frame whatever its `stts` delta says.
  const entries = view.getUint32(stts.start + 4)
  let samples = 0
  for (let i = 0; i < entries; i++)
    samples += view.getUint32(stts.start + 8 + i * 8)
  if (view.getUint32(stsz.start + 8) !== samples) return { refused: 'type' }
  const seconds = (samples * AAC_FRAME) / timescale
  if (!(seconds > 0)) return { refused: 'unreadable' }
  if (Math.abs(seconds - headerDuration / timescale) > HEADER_SLACK_SECONDS)
    return { refused: 'type' }
  return seconds
}
