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
  apeFooterClaiming,
  apeTag,
  floatWavWithBits,
  id3NotSyncsafe,
  lame44k128kCbr,
  layer2Mp2,
  eightBitSyncFrames,
  layer2At32k,
  m4aNoEsds,
  m4aTenthDeltas,
  wavWithTruncatedChunk,
  m4aHeAac,
  m4aTimescaleTimesTen,
  m4aWithChapters,
  undersoldWav,
  wavF32,
  wavF32Extensible51,
  wavF64,
  wavStreamed,
  wavWithChunkAfterData,
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

    it('does not count an ID3v2 (with footer) or ID3v1 tag against the budget', async () => {
      // With the gap using all but 5 bytes of the budget, a tag counted as
      // unaccounted bytes would refuse the file.
      const gap = Buffer.alloc(MAX_UNACCOUNTED_BYTES - 144 - 5, 0x20)
      const body = Buffer.concat([mp3OfSeconds(2), gap, mp3OfSeconds(2)])
      for (const [label, bytes] of [
        ['ID3v1', Buffer.concat([body, id3v1Tag()])],
        ['ID3v2 with a footer', Buffer.concat([id3WithFooter(64), body])],
      ] as const)
        expect(await measure(bytes), label).toBeCloseTo(4, 0)
    })

    it('takes a small APEv2 tag as unaccounted bytes', async () => {
      expect(await measure(Buffer.concat([lameCbr(), apeTag()]))).toBeCloseTo(
        2,
        0,
      )
    })

    it('never lets an APEv2 footer’s size hide frames', async () => {
      // Round 3: a footer claiming the whole file as its tag.
      const frames = mp3OfSeconds(660)
      const bytes = Buffer.concat([frames, apeFooterClaiming(frames.length)])
      expect(await measure(bytes)).toBeGreaterThan(600)
    })

    it('refuses an ID3v2 tag whose size is not syncsafe', async () => {
      // Round 3: bit 7 set in a size byte, which masking would shrink.
      // Read unmasked, the size would swallow the first 16 KB of frames.
      expect(await measureAudio(id3NotSyncsafe(mp3OfSeconds(10)))).toEqual({
        refused: 'type',
      })
    })

    it('takes real LAME 44.1 kHz 128 kbit/s CBR, with its padded frames', async () => {
      expect(await measure(lame44k128kCbr())).toBeCloseTo(2, 0)
    })

    it.each([
      ['MPEG Layer II (MP2)', layer2Mp2()],
      // At 32 kbit/s a Layer II frame is the same size as a Layer III one,
      // so only the layer bits tell them apart.
      // Behind an ID3 tag, so the sniff's own first-frame check is passed.
      ['MPEG Layer II at 32 kbit/s', behindId3(layer2At32k())],
      ['frames with only an 8-bit sync', behindId3(eightBitSyncFrames())],
    ])('refuses %s', async (_, bytes) => {
      expect(await measureAudio(bytes)).toEqual({ refused: 'type' })
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

  describe('WAV: chunks that tile the file, and only data is audio', () => {
    it.each([
      ['32-bit float', wavF32(), 1],
      ['64-bit float', wavF64(), 1],
      ['5.1 float (EXTENSIBLE)', wavF32Extensible51(), 0.25],
    ])('takes a real ffmpeg %s WAV', async (_, bytes, seconds) => {
      expect(await measureAudio(bytes)).toMatchObject({ type: 'audio/wav' })
      expect(await measure(bytes)).toBeCloseTo(seconds, 2)
    })

    it('never counts a chunk after the data as audio', async () => {
      // Round 3: a megabyte of `id3 ` after one second of samples.
      expect(await measure(wavWithChunkAfterData(1, 1024 * 1024))).toBeCloseTo(
        1,
        2,
      )
    })

    it('counts a streamed WAV (data size 0xFFFFFFFF) to the end of the file', async () => {
      expect(await measure(wavStreamed(2))).toBeCloseTo(2, 2)
    })

    it('never uses the header’s byte rate (nAvgBytesPerSec)', async () => {
      expect(
        await measure(wavClaimingByteRate(660, 0x7fffffff)),
      ).toBeGreaterThan(600)
    })

    it.each([
      ['an A-law WAV', alawWav()],
      ['a WAV header and nothing else', Buffer.from('RIFF0000WAVEgarbage')],
      // The data chunk claims one second; thirty seconds of samples follow
      // and do not tile as chunks.
      ['a data chunk that undersells the samples after it', undersoldWav()],
      [
        'bytes after the last chunk',
        Buffer.concat([wavOfSeconds(1), Buffer.from([0x01])]),
      ],
      [
        'a chunk id that is not text',
        wavFromChunks([
          ['fmt ', pcmFmt()],
          ['\x01\x02\x03\x04', Buffer.alloc(4)],
          ['data', Buffer.alloc(800, 0x80)],
        ]),
      ],
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
      [
        'a fmt shorter than 16 bytes',
        wavFromChunks([
          ['fmt ', pcmFmt().subarray(0, 14)],
          ['\x10\x00xx', Buffer.alloc(2)],
          ['data', Buffer.alloc(800, 0x80)],
        ]),
      ],
      ['a fmt claiming more than the file holds', fmtClaiming(18)],
      [
        'a WAV cut off inside its fmt',
        wavFromChunks([['fmt ', pcmFmt()]]).subarray(0, 30),
      ],
      ['16-bit float', floatWavWithBits(16)],
      [
        'a chunk after the data cut off by the end of the file',
        wavWithTruncatedChunk(),
      ],
    ])('refuses %s with the WAV message', async (_, bytes) => {
      expect(await measureAudio(bytes)).toEqual({ refused: 'wav-format' })
    })

    it.each([
      ['12 bits per sample', 34, 12],
      ['no channels', 22, 0],
      ['a sample rate of 0', 24, 0],
    ])(
      'refuses a PCM WAV with %s with the WAV message',
      async (_, at, value) => {
        const wav = wavOfSeconds(1)
        if (at === 24) wav.writeUInt32LE(value, at)
        else wav.writeUInt16LE(value, at)
        expect(await measureAudio(wav)).toEqual({ refused: 'wav-format' })
      },
    )

    it('refuses a WAV with a format and no data as unreadable', async () => {
      expect(await measureAudio(wavOfSeconds(1).subarray(0, 36))).toEqual({
        refused: 'unreadable',
      })
    })

    it.each([
      ['ADPCM (code 2)', 2, 0],
      ['a code-1 GUID with a wrong tail', 1, 9],
    ])('refuses an EXTENSIBLE WAV with %s', async (_, code, spoil) => {
      const wav = Buffer.from(wav24BitStereo())
      wav.writeUInt8(code, 20 + 24)
      if (spoil) wav.writeUInt8(0xee, 20 + 24 + spoil)
      expect(await measureAudio(wav)).toEqual({ refused: 'wav-format' })
    })
  })

  describe('M4A: one sound track, timed by its sample table', () => {
    it.each([
      ['ffmpeg', m4aTone()],
      ['ffmpeg with faststart', faststartM4a()],
      ['Apple afconvert', appleM4a()],
      ['ffmpeg with chapters (a text track)', m4aWithChapters()],
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
      // Round 3: clock ×10 with the header to match plays ten times longer.
      ['a media clock that is not the decoder’s rate', m4aTimescaleTimesTen()],
      ['HE-AAC', m4aHeAac()],
      [
        'stts deltas and header a tenth of what the frames play',
        m4aTenthDeltas(),
      ],
      ['no AAC decoder config (esds)', m4aNoEsds()],
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
    [{ name: 'book.m4b', type: '' }, 'audio/mp4'],
    [{ name: 'book.m4b', type: 'audio/x-m4b' }, 'audio/mp4'],
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
