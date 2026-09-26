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
  freeFormatMp3,
  id3HidingFrames,
  m4aTone,
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
import { countMp3Seconds } from './mp3-frames'

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

  describe('MP3, counted frame by frame', () => {
    it('reads an MP3 past ten minutes as past ten minutes', async () => {
      expect(await measure(mp3OfSeconds(660))).toBeGreaterThan(600)
    })

    it('counts past a LAME-style header (frames AND bytes) claiming ten frames', async () => {
      // The real parser believes the header; this measurement does not.
      const { parseBuffer } = await import('music-metadata')
      const mp3 = mp3UnderClaimed(660)
      const trusted = await parseBuffer(
        mp3,
        { mimeType: 'audio/mpeg' },
        { duration: true },
      )
      expect(trusted.format.duration).toBeLessThan(1)
      expect(await measure(mp3)).toBeGreaterThan(600)
    })

    it('reads an hour under 20 MB, headed as two seconds, as an hour', async () => {
      const hour = mp3UnderClaimed(65 * 60)
      expect(hour.length).toBeLessThan(20 * 1024 * 1024)
      expect(await measure(hour)).toBeGreaterThan(3600)
    })

    it('skips an ID3 tag by its size, not counting frame-like bytes inside it', async () => {
      expect(await measure(id3HidingFrames(700, mp3OfSeconds(2)))).toBeCloseTo(
        2,
        0,
      )
    })

    it('counts MPEG-2 frames and skips junk between frames', () => {
      const junk = Buffer.alloc(500, 0x20)
      expect(
        countMp3Seconds(
          Buffer.concat([mp3OfSeconds(2), junk, mp3OfSeconds(2)]),
        ),
      ).toBeCloseTo(4, 0)
      // MPEG-2 Layer III, 32 kbit/s at 16 kHz: 144-byte frames of 36 ms.
      const mpeg2 = Buffer.alloc(144)
      mpeg2.set([0xff, 0xf3, 0x48, 0xc0])
      expect(
        countMp3Seconds(Buffer.concat(Array(100).fill(mpeg2))),
      ).toBeCloseTo(3.6, 1)
    })

    it('counts frames split by junk bytes, not just the chained pair it anchors on', () => {
      // A minute of frames each followed by one junk byte (a decoder resyncs
      // and plays them), then two chained frames at the very end.
      const frame = mp3OfSeconds(0.03)
      const split = Buffer.concat(
        Array<Buffer>(1700).fill(Buffer.concat([frame, Buffer.from([0])])),
      )
      expect(
        countMp3Seconds(Buffer.concat([split, mp3OfSeconds(0.06)])),
      ).toBeGreaterThan(60)
    })

    it('takes a file of one frame: it ends the file, so it anchors', () => {
      expect(countMp3Seconds(mp3OfSeconds(0.03))).toBeCloseTo(0.036, 3)
    })

    it('counts free-format frames as frames, stepping past each header', () => {
      // 1 s of a normal stream, then 100 free-format frames of 36 ms.
      const counted = countMp3Seconds(
        Buffer.concat([mp3OfSeconds(1), freeFormatMp3(100)]),
      )
      expect(counted).toBeGreaterThan(4.5)
    })

    it('walks 20 MB of sync-like junk after one frame in linear time', async () => {
      const bytes = Buffer.concat([
        mp3OfSeconds(0.03),
        Buffer.alloc(20 * 1024 * 1024 - 144, 0xff),
      ])
      const started = performance.now()
      await measureAudio(bytes)
      expect(performance.now() - started).toBeLessThan(2_000)
    })

    it.each([
      ['AAC (ADTS) behind an ID3 tag', behindId3(adtsTone())],
      ['FLAC behind an ID3 tag', behindId3(flacTone())],
      // No two frames in a row: a free-format stream cannot be anchored.
      ['frames of free format only', freeFormatMp3(100)],
    ])('refuses %s: no Layer III frames', async (_, bytes) => {
      expect(await measureAudio(bytes)).toEqual({ refused: 'type' })
    })
  })

  describe('WAV, by the bytes present', () => {
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
    ])('refuses %s as the wrong type', async (_, bytes) => {
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

  describe('M4A, through the parser', () => {
    it.each([
      ['an MP4 that holds video, though it sniffs as M4A', mp4WithVideo()],
      ['ALAC in an M4A', alacM4a()],
      ['two audio tracks, the second longer', twoTrackM4a()],
      ['a file the parser throws on', Buffer.from('\0\0\0\x08ftyp')],
    ])('refuses %s as the wrong type', async (_, bytes) => {
      expect(await measureAudio(bytes)).toEqual({ refused: 'type' })
    })

    it('refuses an M4A with no readable length as unreadable', async () => {
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
