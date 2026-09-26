import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Real audio bytes for the gallery's audio tests. MP3 and WAV are built here
 * so a length can be chosen; M4A (and an MP4 with a video track) are tiny
 * files made with ffmpeg:
 *   ffmpeg -f lavfi -i sine=frequency=440:duration=1 -c:a aac -b:a 32k tone.m4a
 *   ffmpeg -f lavfi -i sine=duration=1 -f lavfi -i testsrc=size=16x16:rate=1:duration=1 \
 *     -c:a aac -b:a 16k -c:v libx264 -shortest with-video.mp4
 * and, for the refusals, the same tone as AAC in ADTS (`-f adts tone.aac`),
 * FLAC (`-ar 8000 -c:a flac tone.flac`), A-law WAV (`-c:a pcm_alaw
 * tone-alaw.wav`) and ALAC in M4A (`-c:a alac tone-alac.m4a`); two AAC
 * tracks of 2 s and 20 s (`-map 0 -map 1 -ar 8000 -b:a 8k two-tracks.m4a`);
 * and WAVE_FORMAT_EXTENSIBLE PCM, which ffmpeg writes for 24-bit
 * (`-ac 2 -c:a pcm_s24le tone-24bit-stereo.wav`) and for more than two
 * channels (`pan=5.1… -c:a pcm_s16le tone-16bit-5.1.wav`), each 1 s at 8 kHz.
 */

/** MPEG-1 Layer III, 32 kbit/s at 32 kHz, mono: 144-byte frames of 36 ms. */
export function mp3OfSeconds(
  seconds: number,
  { id3 = false, xingFrames }: { id3?: boolean; xingFrames?: number } = {},
): Buffer {
  const frame = Buffer.alloc(144)
  frame.set([0xff, 0xfb, 0x18, 0xc0])
  const frames = Array<Buffer>(Math.ceil(seconds / (1152 / 32000))).fill(frame)
  if (xingFrames !== undefined) {
    // A LAME-style VBR header in the first frame, as encoders write one:
    // the frames AND bytes flags set, claiming `xingFrames` frames and a
    // stream that small. A parser that trusts it never scans the frames.
    const xing = Buffer.from(frame)
    xing.write('Xing', 21)
    xing.writeUInt32BE(0x3, 25)
    xing.writeUInt32BE(xingFrames, 29)
    xing.writeUInt32BE(xingFrames * 144, 33)
    frames.unshift(xing)
  }
  // An empty ID3v2.3 tag, as most encoders write one.
  const tag = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0])
  return Buffer.concat(id3 ? [tag, ...frames] : frames)
}

/** 8-bit mono PCM at `rate` Hz, its header naming exactly the bytes it holds. */
export function wavOfSeconds(seconds: number, rate = 8000): Buffer {
  const data = Math.round(seconds * rate)
  const b = Buffer.alloc(44 + data, 0x80)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + data, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate, 28)
  b.writeUInt16LE(1, 32)
  b.writeUInt16LE(8, 34)
  b.write('data', 36)
  b.writeUInt32LE(data, 40)
  return b
}

export const m4aTone = () => readFileSync(join(__dirname, 'tone.m4a'))
export const mp4WithVideo = () =>
  readFileSync(join(__dirname, 'with-video.mp4'))

const fixture = (name: string) => readFileSync(join(__dirname, name))
export const adtsTone = () => fixture('tone.aac')
export const flacTone = () => fixture('tone.flac')
export const alawWav = () => fixture('tone-alaw.wav')
export const alacM4a = () => fixture('tone-alac.m4a')

/** An empty ID3v2.3 tag, then `body`: what an ID3-tagging tool writes. */
export const behindId3 = (body: Buffer) =>
  Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]), body])

/** The M4A tone with its sample table emptied: `stts` and `stsz` count 0. */
export function m4aWithNoLength(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const stts = bytes.indexOf('stts')
  bytes.writeUInt32BE(0, stts + 4 + 4)
  const stsz = bytes.indexOf('stsz')
  bytes.writeUInt32BE(0, stsz + 4 + 8)
  return bytes
}

/** The M4A tone whose track header (mdhd) claims a tenth of its length. */
export function m4aHeaderUnderClaimed(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const mdhd = bytes.indexOf('mdhd') + 4
  const duration = bytes.readUInt32BE(mdhd + 16)
  bytes.writeUInt32BE(Math.floor(duration / 10), mdhd + 16)
  return bytes
}

/**
 * `seconds` of MP3 whose LAME-style header claims ten frames: the shape the
 * review measured, a long file that parsers trusting the header read as short.
 */
export const mp3UnderClaimed = (seconds: number) =>
  mp3OfSeconds(seconds, { xingFrames: 10 })
export const twoTrackM4a = () => fixture('two-tracks.m4a')
export const wav24BitStereo = () => fixture('tone-24bit-stereo.wav')
export const wav16Bit51 = () => fixture('tone-16bit-5.1.wav')

/** `count` free-format MPEG-1 Layer III frame headers (bitrate index 0). */
export function freeFormatMp3(count: number): Buffer {
  const frame = Buffer.alloc(144)
  frame.set([0xff, 0xfb, 0x08, 0xc0])
  return Buffer.concat(Array<Buffer>(count).fill(frame))
}

/**
 * An ID3v2 tag whose payload is `seconds` of bytes that look like MP3
 * frames (a tag can hold any bytes, an embedded picture say), then `body`.
 */
export function id3HidingFrames(seconds: number, body: Buffer): Buffer {
  const payload = mp3OfSeconds(seconds)
  const n = payload.length
  const header = Buffer.from([
    0x49,
    0x44,
    0x33,
    3,
    0,
    0,
    (n >> 21) & 0x7f,
    (n >> 14) & 0x7f,
    (n >> 7) & 0x7f,
    n & 0x7f,
  ])
  return Buffer.concat([header, payload, body])
}

/** A PCM WAV whose header's byte rate (`nAvgBytesPerSec`) claims `rate`. */
export function wavClaimingByteRate(seconds: number, rate: number): Buffer {
  const wav = wavOfSeconds(seconds)
  wav.writeUInt32LE(rate, 28)
  return wav
}

export const lameCbr = () => fixture('lame-cbr.mp3')
export const lameVbrXing = () => fixture('lame-vbr-xing.mp3')
export const lameId3v1 = () => fixture('lame-id3v1.mp3')
export const fragmentedM4a = () => fixture('fragmented.m4a')

/**
 * An APEv2 tag (header and footer, one item), as taggers append one; `pad`
 * bytes of item value make it as large as a tag holding cover art.
 */
export function apeTag(pad = 0): Buffer {
  const value = Buffer.concat([Buffer.from('Theme'), Buffer.alloc(pad, 0x20)])
  const item = Buffer.alloc(8 + 6 + value.length)
  item.writeUInt32LE(value.length, 0)
  item.write('Title\0', 8)
  value.copy(item, 14)
  const block = (isHeader: boolean) => {
    const b = Buffer.alloc(32)
    b.write('APETAGEX', 0)
    b.writeUInt32LE(2000, 8)
    b.writeUInt32LE(item.length + 32, 12)
    b.writeUInt32LE(1, 16)
    b.writeUInt32LE((0x80000000 | (isHeader ? 0x20000000 : 0)) >>> 0, 20)
    return b
  }
  return Buffer.concat([block(true), item, block(false)])
}

/**
 * MPEG-2.5 Layer III at 8 kHz, 8 kbit/s: 72-byte frames of 72 ms, the
 * smallest a real stream has, so a fake header can hide many.
 */
export function mp3Tiny(frames: number): Buffer {
  const frame = Buffer.alloc(72)
  frame.set([0xff, 0xe3, 0x18, 0xc4])
  return Buffer.concat(Array<Buffer>(frames).fill(frame))
}

/**
 * Real 72 ms frames with, before every 20th, a header of the same stream
 * claiming 160 kbit/s — a 1440-byte frame whose computed length lands in the
 * middle of the next real frame. A walk that jumps by any header it meets
 * skips twenty real frames each time.
 */
export function mp3WithFakeHeaders(seconds: number): Buffer {
  const fake = Buffer.from([0xff, 0xe3, 0xe8, 0xc4])
  const run = mp3Tiny(20)
  const blocks = Math.ceil(seconds / (20 * 0.072))
  return Buffer.concat(
    Array.from({ length: blocks }, () => Buffer.concat([fake, run])),
  )
}

/** A WAV built from chunks, for the malformed shapes. */
export function wavFromChunks(chunks: [string, Buffer][]): Buffer {
  const body = Buffer.concat(
    chunks.map(([id, data]) => {
      const head = Buffer.alloc(8)
      head.write(id, 0)
      head.writeUInt32LE(data.length, 4)
      return Buffer.concat([head, data, Buffer.alloc(data.length % 2)])
    }),
  )
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0)
  riff.writeUInt32LE(4 + body.length, 4)
  riff.write('WAVE', 8)
  return Buffer.concat([riff, body])
}

/** A PCM `fmt ` payload: mono, 8 kHz, 8-bit. */
export const pcmFmt = () => wavOfSeconds(0).subarray(20, 36)

/** `count` real 36 ms frames, each followed by one junk byte. */
export function splitFrames(count: number): Buffer {
  const frame = mp3OfSeconds(0.03)
  return Buffer.concat(
    Array<Buffer>(count).fill(Buffer.concat([frame, Buffer.from([0])])),
  )
}

/** 1 s of AAC from Apple's own encoder (`afconvert -f m4af -d aac -b 16000`). */
export const appleM4a = () => fixture('apple-afconvert.m4a')
/** 1 s of AAC from ffmpeg with the movie box first (`-movflags +faststart`). */
export const faststartM4a = () => fixture('faststart.m4a')

/** An ID3v1 tag: 128 bytes at the very end. */
export const id3v1Tag = () => {
  const b = Buffer.alloc(128, 0x20)
  b.write('TAG', 0)
  return b
}

/** An ID3v2.4 tag with its footer flag set: `size` bytes, then a footer. */
export function id3WithFooter(size: number): Buffer {
  const header = Buffer.from([
    0x49,
    0x44,
    0x33,
    4,
    0,
    0x10,
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  ])
  const footer = Buffer.from(header)
  footer.write('3DI', 0)
  return Buffer.concat([header, Buffer.alloc(size), footer])
}

/**
 * MPEG-2 Layer III at 16 kHz, 32 kbit/s: 144-byte frames of 36 ms — the same
 * frame size as {@link mp3OfSeconds}' MPEG-1 frames, another stream.
 */
export function mp3Mpeg2(seconds: number): Buffer {
  const frame = Buffer.alloc(144)
  frame.set([0xff, 0xf3, 0x48, 0xc0])
  return Buffer.concat(Array<Buffer>(Math.ceil(seconds / 0.036)).fill(frame))
}

/** A box of `m4a` by type, whole: its size and type included. */
function box(bytes: Buffer, type: string): Buffer {
  const at = bytes.indexOf(type) - 4
  return bytes.subarray(at, at + bytes.readUInt32BE(at))
}

/** The M4A tone with a second copy of its movie box appended. */
export const m4aTwoMoov = () => {
  const bytes = m4aTone()
  return Buffer.concat([bytes, box(bytes, 'moov')])
}

/** The M4A tone whose sample sizes (`stsz`) count more samples than `stts`. */
export function m4aSampleCountMismatch(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const stsz = bytes.indexOf('stsz') + 4
  bytes.writeUInt32BE(bytes.readUInt32BE(stsz + 8) + 1000, stsz + 8)
  return bytes
}

/** The M4A tone whose sample description claims a second entry. */
export function m4aTwoSampleEntries(): Buffer {
  const bytes = Buffer.from(m4aTone())
  bytes.writeUInt32BE(2, bytes.indexOf('stsd') + 4 + 4)
  return bytes
}

/** The faststart M4A (movie box first) with its media data cut short. */
export const m4aTruncated = () => {
  const bytes = faststartM4a()
  return bytes.subarray(0, bytes.length - 100)
}

/** A WAV of one complete 16-byte fmt whose chunk size claims `size`. */
export function fmtClaiming(size: number): Buffer {
  const bytes = wavFromChunks([['fmt ', pcmFmt()]])
  bytes.writeUInt32LE(size, 16)
  return bytes
}

/** The M4A tone with a media timescale of 0 (ticks per second). */
export function m4aZeroTimescale(): Buffer {
  const bytes = Buffer.from(m4aTone())
  bytes.writeUInt32BE(0, bytes.indexOf('mdhd') + 4 + 12)
  return bytes
}

export const lame44k128kCbr = () => fixture('lame-44k-128k-cbr.mp3')
export const layer2Mp2 = () => fixture('layer2.mp2')
export const m4aWithChapters = () => fixture('with-chapters.m4a')
export const wavF32 = () => fixture('tone-f32.wav')
export const wavF64 = () => fixture('tone-f64.wav')
export const wavF32Extensible51 = () => fixture('tone-f32-5.1.wav')

/** An ID3v2.3 tag of `size` bytes whose size field has bit 7 set somewhere. */
export function id3NotSyncsafe(body: Buffer): Buffer {
  const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0x80, 0x00])
  return Buffer.concat([header, body])
}

/** An APEv2 footer whose size claims `size` bytes of tag before it. */
export function apeFooterClaiming(size: number): Buffer {
  const b = Buffer.alloc(32)
  b.write('APETAGEX', 0)
  b.writeUInt32LE(2000, 8)
  b.writeUInt32LE(size, 12)
  return b
}

/**
 * The M4A tone with its media clock ×10 and nothing else changed: header,
 * sample table and deltas agree with each other, and a reading by timescale
 * makes it a tenth as long as it plays (the round-3 repro: 180 s for 1800).
 */
export function m4aTimescaleTimesTen(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const mdhd = bytes.indexOf('mdhd') + 4
  bytes.writeUInt32BE(bytes.readUInt32BE(mdhd + 12) * 10, mdhd + 12)
  return bytes
}

/** The M4A tone whose AAC config says HE-AAC (audio object type 5). */
export function m4aHeAac(): Buffer {
  const bytes = Buffer.from(m4aTone())
  // AudioSpecificConfig follows the DecoderSpecificInfo tag 0x05 in esds.
  const esds = bytes.indexOf('esds')
  let at = bytes.indexOf(0x05, esds + 8 + 5 + 13)
  while (bytes[++at] & 0x80);
  at++
  bytes[at] = (5 << 3) | (bytes[at] & 0x07)
  return bytes
}

/**
 * The M4A tone with every `stts` delta and the header duration ÷10: timed as
 * a tenth of what its 1024-sample frames play.
 */
export function m4aTenthDeltas(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const stts = bytes.indexOf('stts') + 4
  const entries = bytes.readUInt32BE(stts + 4)
  for (let i = 0; i < entries; i++) {
    const at = stts + 12 + i * 8
    bytes.writeUInt32BE(Math.floor(bytes.readUInt32BE(at) / 10), at)
  }
  const mdhd = bytes.indexOf('mdhd') + 4
  bytes.writeUInt32BE(Math.floor(bytes.readUInt32BE(mdhd + 16) / 10), mdhd + 16)
  return bytes
}

/** The M4A tone with its `esds` renamed away: no AAC decoder config. */
export function m4aNoEsds(): Buffer {
  const bytes = Buffer.from(m4aTone())
  bytes.write('free', bytes.indexOf('esds'))
  return bytes
}

/**
 * 1 MB of 144-byte "frames" whose header has the Layer III and MPEG-1 bits
 * but only an 8-bit sync (`FF 1B`): not MPEG audio at all.
 */
export function eightBitSyncFrames(): Buffer {
  const frame = Buffer.alloc(144)
  frame.set([0xff, 0x1b, 0x18, 0xc0])
  return Buffer.concat(Array<Buffer>(7282).fill(frame))
}

/** A PCM WAV followed by a LIST chunk claiming more than the file holds. */
export function wavWithTruncatedChunk(): Buffer {
  const head = Buffer.alloc(8)
  head.write('LIST', 0)
  head.writeUInt32LE(1000, 4)
  return Buffer.concat([wavOfSeconds(1), head, Buffer.alloc(10)])
}

/** A PCM WAV of `seconds` with a chunk of `extra` bytes after its data. */
export function wavWithChunkAfterData(seconds: number, extra: number): Buffer {
  return wavFromChunks([
    ['fmt ', pcmFmt()],
    ['data', Buffer.alloc(Math.round(seconds * 8000), 0x80)],
    ['id3 ', Buffer.alloc(extra, 0x41)],
  ])
}

/** A PCM WAV whose data size is 0xFFFFFFFF, as a streamed file writes. */
export function wavStreamed(seconds: number): Buffer {
  const wav = wavOfSeconds(seconds)
  wav.writeUInt32LE(0xffffffff, 40)
  return wav
}

/** A PCM WAV whose data chunk claims one second over thirty of samples. */
export function undersoldWav(): Buffer {
  const wav = wavOfSeconds(30)
  wav.writeUInt32LE(8000, 40)
  wav.writeUInt32LE(36 + 8000, 4)
  return wav
}

/** The 32-bit float WAV relabelled as `bits` bits per sample. */
export function floatWavWithBits(bits: number): Buffer {
  const wav = Buffer.from(wavF32())
  wav.writeUInt16LE(bits, 34)
  return wav
}
export const layer2At32k = () => fixture('layer2-32k.mp2')

/** Real ffmpeg u8 mono WAVs of 44 101 samples: an odd data chunk, padded. */
export const wavOddWithList = () => fixture('u8-odd.wav')
export const wavOddBitexact = () => fixture('u8-odd-bitexact.wav')

/**
 * The AAC tone with its sample entry renamed `alac`, its `esds` kept: an ALAC
 * entry a config reader would take for AAC (ALAC frames hold 4096 samples,
 * so a 1024-per-frame length would be a quarter of what plays).
 */
export function alacEntryWithEsds(): Buffer {
  const bytes = Buffer.from(m4aTone())
  bytes.write('alac', bytes.indexOf('mp4a'))
  return bytes
}

/** Where the tone's esds descriptors start (after its version and flags). */
const esdsBody = (bytes: Buffer) => bytes.indexOf('esds') + 8

/** The tone with its ES descriptor's tag changed from 0x03. */
export function m4aEsTagWrong(): Buffer {
  const bytes = Buffer.from(m4aTone())
  bytes[esdsBody(bytes)] = 0x13
  return bytes
}

/** The tone with its DecoderConfig's object type 0x6B (MP3), not AAC (0x40). */
export function m4aConfigNotAac(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const config = bytes.indexOf(0x04, esdsBody(bytes) + 5)
  let at = config + 1
  while (bytes[at++] & 0x80);
  bytes[at] = 0x6b
  return bytes
}

/** The tone with its ES descriptor claiming more bytes than the esds holds. */
export function m4aEsSizeOverrun(): Buffer {
  const bytes = Buffer.from(m4aTone())
  // ffmpeg writes the size in 4 bytes (0x80 0x80 0x80 n): make n 127, past
  // the end of the esds.
  let at = esdsBody(bytes) + 1
  while (bytes[at] & 0x80) at++
  bytes[at] = 0x7f
  return bytes
}

/** The 24-bit EXTENSIBLE WAV with the GUID's second byte set (code 0x0101). */
export function wavGuidHighByte(): Buffer {
  const wav = Buffer.from(wav24BitStereo())
  wav.writeUInt8(1, 20 + 24 + 1)
  return wav
}

/** The tone with its DecoderConfig descriptor's tag changed from 0x04. */
export function m4aConfigTagWrong(): Buffer {
  const bytes = Buffer.from(m4aTone())
  bytes[bytes.indexOf(0x04, esdsBody(bytes) + 5)] = 0x14
  return bytes
}

/** The tone with its DecoderSpecificInfo descriptor's tag changed from 0x05. */
export function m4aDsiTagWrong(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const config = bytes.indexOf(0x04, esdsBody(bytes) + 5)
  bytes[bytes.indexOf(0x05, config + 5 + 13)] = 0x15
  return bytes
}

/** The tone with its AAC sampling-frequency index set to 15 (none). */
export function m4aRateIndexInvalid(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const config = bytes.indexOf(0x04, esdsBody(bytes) + 5)
  let at = bytes.indexOf(0x05, config + 5 + 13) + 1
  while (bytes[at++] & 0x80);
  bytes[at] |= 0x07
  bytes[at + 1] |= 0x80
  return bytes
}

/**
 * The tone with its DecoderSpecificInfo claiming ONE byte: the rate index's
 * last bit then lies outside it (read from what follows).
 */
export function m4aDsiOneByte(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const config = bytes.indexOf(0x04, esdsBody(bytes) + 5)
  let at = bytes.indexOf(0x05, config + 5 + 13) + 1
  while (bytes[at] & 0x80) at++
  bytes[at] = 1
  return bytes
}
