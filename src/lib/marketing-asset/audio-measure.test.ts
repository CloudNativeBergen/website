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
  m4aTone,
  m4aWithNoLength,
  mp3OfSeconds,
  mp3UnderClaimed,
  mp4WithVideo,
  wavOfSeconds,
} from './__tests__/audio-fixtures'

vi.mock('server-only', () => ({}))
import { countMp3Seconds, measureAudio } from './audio-measure'

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
  ] as const)('reads the length of a real %s', async (_, bytes, type, s) => {
    const measured = await measureAudio(bytes, type)
    expect(measured).toHaveProperty('durationSeconds')
    expect(
      (measured as { durationSeconds: number }).durationSeconds,
    ).toBeCloseTo(s, 0)
  })

  const seconds = async (
    bytes: Buffer,
    type: Parameters<typeof measureAudio>[1],
  ) => {
    const measured = await measureAudio(bytes, type)
    return 'durationSeconds' in measured ? measured.durationSeconds : measured
  }

  it('reads an MP3 past ten minutes as past ten minutes', async () => {
    expect(await seconds(mp3OfSeconds(660), 'audio/mpeg')).toBeGreaterThan(600)
  })

  it('counts an MP3 whose LAME-style header (frames AND bytes) claims ten frames by the frames it holds', async () => {
    // The real parser believes the header: prove the premise, then the count.
    const { parseBuffer } = await import('music-metadata')
    const mp3 = mp3UnderClaimed(660)
    const trusted = await parseBuffer(
      mp3,
      { mimeType: 'audio/mpeg' },
      { duration: true },
    )
    expect(trusted.format.duration).toBeLessThan(1)
    expect(await seconds(mp3, 'audio/mpeg')).toBeGreaterThan(600)
  })

  it('reads an hour of MP3 under 20 MB, headed as two seconds, as an hour', async () => {
    const hour = mp3UnderClaimed(65 * 60)
    expect(hour.length).toBeLessThan(20 * 1024 * 1024)
    expect(await seconds(hour, 'audio/mpeg')).toBeGreaterThan(3600)
  })

  it('counts frames of every MPEG version, skips junk between them, and finds none in junk', () => {
    const junk = Buffer.alloc(500, 0x20)
    expect(
      countMp3Seconds(Buffer.concat([mp3OfSeconds(2), junk, mp3OfSeconds(2)])),
    ).toBeCloseTo(4, 0)
    // MPEG-2 Layer III, 32 kbit/s at 16 kHz: 144-byte frames of 36 ms.
    const mpeg2 = Buffer.alloc(144)
    mpeg2.set([0xff, 0xf3, 0x48, 0xc0])
    expect(countMp3Seconds(Buffer.concat(Array(100).fill(mpeg2)))).toBeCloseTo(
      3.6,
      1,
    )
    expect(countMp3Seconds(junk)).toBe(0)
  })

  it.each([
    [
      'an MP4 that holds video, though it sniffs as M4A',
      mp4WithVideo(),
      'audio/mp4',
    ],
    ['ALAC in an M4A', alacM4a(), 'audio/mp4'],
    ['AAC (ADTS) behind an ID3 tag', behindId3(adtsTone()), 'audio/mpeg'],
    ['FLAC behind an ID3 tag', behindId3(flacTone()), 'audio/mpeg'],
    ['an A-law WAV', alawWav(), 'audio/wav'],
    ['a WAV sent as MP3', wavOfSeconds(1), 'audio/mpeg'],
    [
      'a WAV header and nothing else',
      Buffer.from('RIFF0000WAVEgarbage'),
      'audio/wav',
    ],
  ] as const)('refuses %s as the wrong type', async (_, bytes, type) => {
    expect(await measureAudio(bytes, type)).toEqual({ refused: 'type' })
  })

  it('refuses an M4A whose length cannot be read as unreadable, not as the wrong type', async () => {
    expect(await measureAudio(m4aWithNoLength(), 'audio/mp4')).toEqual({
      refused: 'unreadable',
    })
  })

  it('measures a WAV by the bytes it holds, not a header that undersells them', async () => {
    const wav = wavOfSeconds(30)
    // The data chunk claims one second; thirty seconds of samples follow.
    wav.writeUInt32LE(8000, 40)
    wav.writeUInt32LE(36 + 8000, 4)
    expect(await seconds(wav, 'audio/wav')).toBeGreaterThan(29)
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
