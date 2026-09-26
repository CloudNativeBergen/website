/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import {
  audioTypeForFile,
  formatTrackLength,
  sniffAudioType,
} from './audio-type'
import {
  adtsTone,
  alacM4a,
  alawWav,
  behindId3,
  flacTone,
  apeTag,
  fmtClaiming,
  m4aSampleCountMismatch,
  m4aTruncated,
  m4aTwoMoov,
  m4aTwoSampleEntries,
  m4aZeroTimescale,
  id3v1Tag,
  id3WithFooter,
  mp3Mpeg2,
  appleM4a,
  faststartM4a,
  fragmentedM4a,
  freeFormatMp3,
  id3HidingFrames,
  lameCbr,
  lameId3v1,
  lameVbrXing,
  mp3WithFakeHeaders,
  pcmFmt,
  splitFrames,
  wavFromChunks,
  m4aTone,
  m4aHeaderUnderClaimed,
  m4aWithNoLength,
  mp3OfSeconds,
  mp3UnderClaimed,
  mp4WithVideo,
  twoTrackM4a,
  wav16Bit51,
  wav24BitStereo,
  wavClaimingByteRate,
  wavOfSeconds,
} from './__tests__/audio-fixtures'

vi.mock('server-only', () => ({}))
import { measureAudio } from './audio-measure'
import { MAX_UNACCOUNTED_BYTES } from './mp3-frames'

/** The measured seconds, or the refusal. */
async function measure(bytes: Uint8Array) {
  const measured = await measureAudio(bytes)
  return 'durationSeconds' in measured ? measured.durationSeconds : measured
}

describe('sniffAudioType', () => {
  it.each([
    ['an MP3 frame', mp3OfSeconds(1), 'audio/mpeg'],
    ['an MP3 with an ID3 tag', mp3OfSeconds(1, { id3: true }), 'audio/mpeg'],
    ['an M4A', m4aTone(), 'audio/mp4'],
    ['a WAV', wavOfSeconds(1), 'audio/wav'],
  ])('knows %s from its bytes', (_, bytes, type) => {
    expect(sniffAudioType(bytes)).toBe(type)
  })

  it.each([
    ['a PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['AAC in ADTS', Buffer.from([0xff, 0xf1, 0x50, 0x80])],
    ['a WebP (RIFF but not WAVE)', Buffer.from('RIFF0000WEBPVP8 ')],
    ['text', Buffer.from('<html>hello</html>')],
    ['nothing', Buffer.alloc(0)],
  ])('refuses %s', (_, bytes) => {
    expect(sniffAudioType(bytes)).toBeNull()
  })
})

describe('measureAudio', () => {
  it.each([
    ['MP3', mp3OfSeconds(3), 'audio/mpeg', 3],
    ['WAV', wavOfSeconds(2), 'audio/wav', 2],
    ['M4A', m4aTone(), 'audio/mp4', 1],
    ['24-bit stereo WAV (EXTENSIBLE)', wav24BitStereo(), 'audio/wav', 1],
    ['16-bit 5.1 WAV (EXTENSIBLE)', wav16Bit51(), 'audio/wav', 1],
  ] as const)(
    'reads the type and length of a real %s',
    async (_, bytes, type, s) => {
      const measured = await measureAudio(bytes)
      expect(measured).toMatchObject({ type })
      expect(await measure(bytes)).toBeCloseTo(s, 0)
    },
  )

  it('refuses a PNG as the wrong type', async () => {
    expect(
      await measureAudio(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toEqual({ refused: 'type' })
  })

  describe('MP3: tags plus a chain of frames, every byte accounted for', () => {
    it.each([
      ['LAME CBR', lameCbr()],
      ['LAME VBR with a Xing header', lameVbrXing()],
      ['LAME with ID3v2 and ID3v1 tags', lameId3v1()],
      ['LAME CBR with an APEv2 tag', Buffer.concat([lameCbr(), apeTag()])],
    ])('takes real encoder output: %s', async (_, bytes) => {
      expect(await measure(bytes)).toBeCloseTo(2, 0)
    })

    it('reads an MP3 past ten minutes as past ten minutes', async () => {
      expect(await measure(mp3OfSeconds(660))).toBeGreaterThan(600)
    })

    it('counts past a LAME-style header (frames AND bytes) claiming ten frames', async () => {
      expect(await measure(mp3UnderClaimed(660))).toBeGreaterThan(600)
    })

    it('reads an hour under 20 MB, headed as two seconds, as an hour', async () => {
      const hour = mp3UnderClaimed(65 * 60)
      expect(hour.length).toBeLessThan(20 * 1024 * 1024)
      expect(await measure(hour)).toBeGreaterThan(3600)
    })

    it('never jumps by a header whose successor does not follow: fake headers hide no frames', async () => {
      // Round 2, finding 1: a header of the same stream claiming 1440 bytes
      // before every twenty real frames.
      expect(await measure(mp3WithFakeHeaders(11 * 60))).toBeGreaterThan(600)
    })

    it('skips an ID3 tag by its size, not counting frame-like bytes inside it', async () => {
      expect(await measure(id3HidingFrames(700, mp3OfSeconds(2)))).toBeCloseTo(
        2,
        0,
      )
    })

    it('takes a file of one frame: it ends the file', async () => {
      expect(await measure(mp3OfSeconds(0.03))).toBeCloseTo(0.036, 3)
    })

    it('takes a few junk bytes, under the budget', async () => {
      // The frame before the gap has no successor, so it too is unaccounted.
      const junk = Buffer.alloc(MAX_UNACCOUNTED_BYTES - 144, 0x20)
      expect(
        await measure(Buffer.concat([mp3OfSeconds(2), junk, mp3OfSeconds(2)])),
      ).toBeCloseTo(4, 0)
    })

    it('refuses one byte over the unaccounted budget', async () => {
      const junk = Buffer.alloc(MAX_UNACCOUNTED_BYTES - 143, 0x20)
      expect(
        await measureAudio(
          Buffer.concat([mp3OfSeconds(2), junk, mp3OfSeconds(2)]),
        ),
      ).toEqual({ refused: 'type' })
    })

    it('does not count the tags at either end against the budget', async () => {
      // With the gap using all but 5 bytes of the budget, a tag counted as
      // unaccounted bytes would refuse the file.
      const gap = Buffer.alloc(MAX_UNACCOUNTED_BYTES - 144 - 5, 0x20)
      const body = Buffer.concat([mp3OfSeconds(2), gap, mp3OfSeconds(2)])
      for (const [label, bytes] of [
        ['ID3v1', Buffer.concat([body, id3v1Tag()])],
        ['APEv2 with a header', Buffer.concat([body, apeTag(5000)])],
        ['APEv2 then ID3v1', Buffer.concat([body, apeTag(5000), id3v1Tag()])],
        ['ID3v2 with a footer', Buffer.concat([id3WithFooter(64), body])],
      ] as const)
        expect(await measure(bytes), label).toBeCloseTo(4, 0)
    })

    it('holds to ONE stream: frames of another after a gap are unaccounted', async () => {
      expect(
        await measureAudio(Buffer.concat([mp3OfSeconds(2), mp3Mpeg2(2)])),
      ).toEqual({ refused: 'type' })
    })

    it('refuses 20 MB of sync-like junk after one frame, in linear time', async () => {
      const bytes = Buffer.concat([
        mp3OfSeconds(0.03),
        Buffer.alloc(20 * 1024 * 1024 - 144, 0xff),
      ])
      const started = performance.now()
      expect(await measureAudio(bytes)).toEqual({ refused: 'type' })
      expect(performance.now() - started).toBeLessThan(2_000)
    })

    it.each([
      // Round 2, finding 2: two real frames, then half an hour of AAC.
      [
        'ID3, two real frames, then 30 minutes of AAC (ADTS)',
        behindId3(
          Buffer.concat([
            mp3OfSeconds(0.06),
            ...Array<Buffer>(700).fill(adtsTone()),
          ]),
        ),
      ],
      ['AAC (ADTS) behind an ID3 tag', behindId3(adtsTone())],
      ['FLAC behind an ID3 tag', behindId3(flacTone())],
      ['frames of free format only', freeFormatMp3(100)],
      ['frames split by junk bytes', splitFrames(1700)],
    ])('refuses %s', async (_, bytes) => {
      expect(await measureAudio(bytes)).toEqual({ refused: 'type' })
    })
  })

  describe('WAV: one fmt, then one data, by the bytes present', () => {
    it('measures by the bytes held, not a data chunk that undersells them', async () => {
      const wav = wavOfSeconds(30)
      wav.writeUInt32LE(8000, 40)
      wav.writeUInt32LE(36 + 8000, 4)
      expect(await measure(wav)).toBeGreaterThan(29)
    })

    it('never uses the header’s byte rate (nAvgBytesPerSec)', async () => {
      expect(
        await measure(wavClaimingByteRate(660, 0x7fffffff)),
      ).toBeGreaterThan(600)
    })

    it.each([
      ['an A-law WAV', alawWav()],
      ['a WAV header and nothing else', Buffer.from('RIFF0000WAVEgarbage')],
      // Round 2, finding 3: a second fmt re-describing the data after it.
      [
        'a second fmt chunk',
        wavFromChunks([
          ['fmt ', pcmFmt()],
          ['fmt ', pcmFmt()],
          ['data', Buffer.alloc(800, 0x80)],
        ]),
      ],
      [
        'a second data chunk',
        wavFromChunks([
          ['fmt ', pcmFmt()],
          ['data', Buffer.alloc(800, 0x80)],
          ['data', Buffer.alloc(800, 0x80)],
        ]),
      ],
      [
        'data before fmt',
        wavFromChunks([
          ['data', Buffer.alloc(800, 0x80)],
          ['fmt ', pcmFmt()],
        ]),
      ],
      // Followed by a chunk whose id would be read as 16 bits per sample.
      [
        'a fmt shorter than 16 bytes',
        wavFromChunks([
          ['fmt ', pcmFmt().subarray(0, 14)],
          ['\x10\x00xx', Buffer.alloc(2)],
          ['data', Buffer.alloc(800, 0x80)],
        ]),
      ],
      // Its 16 bytes all there, but it claims 18: the file stops short.
      ['a fmt claiming more than the file holds', fmtClaiming(18)],
      [
        'a WAV cut off inside its fmt',
        wavFromChunks([['fmt ', pcmFmt()]]).subarray(0, 30),
      ],
    ])('refuses %s as the wrong type, without throwing', async (_, bytes) => {
      expect(await measureAudio(bytes)).toEqual({ refused: 'type' })
    })

    it.each([
      ['12 bits per sample', 34, 12],
      ['no channels', 22, 0],
      ['a sample rate of 0', 24, 0],
    ])('refuses a PCM WAV with %s as the wrong type', async (_, at, value) => {
      const wav = wavOfSeconds(1)
      if (at === 24) wav.writeUInt32LE(value, at)
      else wav.writeUInt16LE(value, at)
      expect(await measureAudio(wav)).toEqual({ refused: 'type' })
    })

    it('refuses a WAV with a format and no data as unreadable', async () => {
      expect(await measureAudio(wavOfSeconds(1).subarray(0, 36))).toEqual({
        refused: 'unreadable',
      })
    })

    it('refuses an EXTENSIBLE WAV whose sub-format is not PCM', async () => {
      const wav = Buffer.from(wav24BitStereo())
      // The GUID's first byte: 3 is IEEE float.
      wav.writeUInt8(3, 20 + 24)
      expect(await measureAudio(wav)).toEqual({ refused: 'type' })
    })
  })

  describe('M4A: one sound track, timed by its sample table', () => {
    it.each([
      ['ffmpeg', m4aTone()],
      ['ffmpeg with faststart', faststartM4a()],
      ['Apple afconvert', appleM4a()],
    ])('takes real encoder output: %s', async (_, bytes) => {
      expect(await measure(bytes)).toBeCloseTo(1, 0)
    })

    it.each([
      ['an MP4 that holds video, though it sniffs as M4A', mp4WithVideo()],
      ['ALAC in an M4A', alacM4a()],
      ['two audio tracks, the second longer', twoTrackM4a()],
      ['a fragmented MP4', fragmentedM4a()],
      ['two movie boxes', m4aTwoMoov()],
      [
        'a sample table whose sizes count more samples',
        m4aSampleCountMismatch(),
      ],
      ['a sample description with a second entry', m4aTwoSampleEntries()],
      ['a file cut off inside its media data', m4aTruncated()],
      // Would otherwise read as infinitely long, not as malformed.
      ['a media timescale of 0', m4aZeroTimescale()],
      [
        'a file whose boxes run past its end',
        Buffer.from('\0\0\0\x10ftypM4A \0\0'),
      ],
      // Round 2, finding 4: the header says a tenth of what the samples play.
      ['a track header underselling its sample table', m4aHeaderUnderClaimed()],
    ])('refuses %s as the wrong type', async (_, bytes) => {
      expect(await measureAudio(bytes)).toEqual({ refused: 'type' })
    })

    it('refuses an M4A with an empty sample table as unreadable', async () => {
      expect(await measureAudio(m4aWithNoLength())).toEqual({
        refused: 'unreadable',
      })
    })
  })
})

describe('audioTypeForFile', () => {
  it.each([
    [{ name: 'a.mp3', type: 'audio/mpeg' }, 'audio/mpeg'],
    [{ name: 'a.m4a', type: 'audio/x-m4a' }, 'audio/mp4'],
    [{ name: 'a.wav', type: 'audio/x-wav' }, 'audio/wav'],
    [{ name: 'a.wav', type: '' }, 'audio/wav'],
    [{ name: 'a.flac', type: 'audio/flac' }, null],
    [{ name: 'a.mp3', type: 'image/png' }, null],
  ])('%o → %s', (file, type) => {
    expect(audioTypeForFile(file)).toBe(type)
  })
})

it('formats a length as m:ss', () => {
  expect(formatTrackLength(83.4)).toBe('1:23')
  expect(formatTrackLength(600)).toBe('10:00')
})
