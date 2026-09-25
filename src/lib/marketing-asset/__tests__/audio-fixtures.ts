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
 * tone-alaw.wav`) and ALAC in M4A (`-c:a alac tone-alac.m4a`).
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

/** The M4A tone with every duration field (mvhd, tkhd, mdhd) set to zero. */
export function m4aWithNoLength(): Buffer {
  const bytes = Buffer.from(m4aTone())
  const at = { mvhd: 20, mdhd: 20, tkhd: 24 }
  for (const [box, offset] of Object.entries(at)) {
    const i = bytes.indexOf(box)
    if (i >= 0) bytes.writeUInt32BE(0, i + offset)
  }
  return bytes
}

/**
 * `seconds` of MP3 whose LAME-style header claims ten frames: the shape the
 * review measured, a long file that parsers trusting the header read as short.
 */
export const mp3UnderClaimed = (seconds: number) =>
  mp3OfSeconds(seconds, { xingFrames: 10 })
