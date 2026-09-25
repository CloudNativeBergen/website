/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import {
  audioTypeForFile,
  formatTrackLength,
  sniffAudioType,
} from './audio-type'
import {
  m4aTone,
  mp3OfSeconds,
  mp4WithVideo,
  wavOfSeconds,
} from './__tests__/audio-fixtures'

vi.mock('server-only', () => ({}))
import { measureAudio } from './audio-measure'

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
    expect(measured?.durationSeconds).toBeCloseTo(s, 0)
  })

  it('reads an MP3 past ten minutes as past ten minutes', async () => {
    const measured = await measureAudio(mp3OfSeconds(660), 'audio/mpeg')
    expect(measured?.durationSeconds).toBeGreaterThan(600)
  })

  it('reads an MP3 whose VBR header claims ten frames by the frames it holds', async () => {
    const mp3 = mp3OfSeconds(660, { xingFrames: 10 })
    const measured = await measureAudio(mp3, 'audio/mpeg')
    expect(measured?.durationSeconds).toBeGreaterThan(600)
  })

  it('refuses an MP4 that holds video, though its container sniffs as M4A', async () => {
    expect(await measureAudio(mp4WithVideo(), 'audio/mp4')).toBeNull()
  })

  it('refuses bytes whose format is not the sniffed one', async () => {
    expect(await measureAudio(wavOfSeconds(1), 'audio/mpeg')).toBeNull()
  })

  it('refuses a WAV header with no readable length', async () => {
    expect(
      await measureAudio(Buffer.from('RIFF0000WAVEgarbage'), 'audio/wav'),
    ).toBeNull()
  })

  it('measures a WAV by the bytes it holds, not a header that undersells them', async () => {
    const wav = wavOfSeconds(30)
    // The data chunk claims one second; thirty seconds of samples follow.
    wav.writeUInt32LE(8000, 40)
    wav.writeUInt32LE(36 + 8000, 4)
    const measured = await measureAudio(wav, 'audio/wav')
    expect(measured?.durationSeconds).toBeGreaterThan(29)
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
