import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { MemeGenerator } from './MemeGenerator'
import type { BackgroundGallery } from './meme-generator-gallery'
import { MIX_RATE, findClick } from './meme-generator-music'

/**
 * A video's music track (#1179, studio video spec §6): the picker, start,
 * volume and fades — and, where the browser can encode, a REAL export whose
 * file is decoded back to check the sound is in it, in step.
 */
const meta = {
  title: 'Systems/Marketing/Admin/MemeGenerator/Music',
  component: MemeGenerator,
  parameters: { layout: 'fullscreen' },
  args: {
    conferenceLogos: { title: 'Cloud Native Days Norway 2026' },
  },
} satisfies Meta<typeof MemeGenerator>

export default meta
type Story = StoryObj<typeof meta>

/** Where the test track's clicks are, in seconds into the TRACK. */
const CLICKS = [2, 4]
const TRACK_SECONDS = 20

/**
 * A 20 s, 48 kHz stereo WAV: a quiet 220 Hz tone, with a 2 ms click at each
 * of CLICKS — so where a click lands in the export says where the track
 * started and whether it is in step.
 */
function testTrack(): ArrayBuffer {
  const frames = TRACK_SECONDS * MIX_RATE
  const bytes = new ArrayBuffer(44 + frames * 4)
  const view = new DataView(bytes)
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + frames * 4, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, MIX_RATE, true)
  view.setUint32(28, MIX_RATE * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, frames * 4, true)
  const clickStarts = CLICKS.map((s) => s * MIX_RATE)
  for (let i = 0; i < frames; i++) {
    const click = clickStarts.some((at) => i >= at && i < at + 96)
    const sample = click
      ? 0.9
      : 0.1 * Math.sin((2 * Math.PI * 220 * i) / MIX_RATE)
    const int = Math.round(sample * 32767)
    view.setInt16(44 + i * 4, int, true)
    view.setInt16(46 + i * 4, int, true)
  }
  return bytes
}

const musicGallery: BackgroundGallery = {
  images: async () => [],
  resolve: async () => {
    throw new Error('No images here')
  },
  keep: async () => ({ _id: 'kept' }),
  tracks: async () => [
    { _id: 'track-theme', title: 'Conference theme', durationSeconds: 20 },
    { _id: 'track-outro', title: 'Outro sting', durationSeconds: 185 },
  ],
  loadTrack: async () => testTrack(),
}

type Canvas = ReturnType<typeof within>

async function setSeconds(canvas: Canvas, label: string, value: number) {
  const field = canvas.getByLabelText(label)
  await userEvent.clear(field)
  await userEvent.type(field, `${value}{Enter}`)
}

/** Video mode, two 3 s scenes, the theme picked from 1 s in, fading out 1 s. */
async function setUpMusic(canvas: Canvas) {
  await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
  const music = canvas.getByRole('region', { name: 'Music' })
  await userEvent.selectOptions(
    within(music).getByLabelText('Music'),
    'track-theme',
  )
  await setSeconds(within(music), 'Start in track', 1)
  await setSeconds(within(music), 'Fade in', 0)
  await setSeconds(within(music), 'Fade out', 1)
  await waitFor(() =>
    expect(within(music).getByRole('status')).toHaveTextContent(
      'Plays from 0:01 of 0:20, and is cut at the end of the video.',
    ),
  )
  return music
}

/** The panel, set up: what the screenshots are of. */
export const MusicTrack: Story = {
  args: { gallery: musicGallery },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const music = await setUpMusic(canvas)
    expect(within(music).getByLabelText(/Volume/)).toHaveValue('80')
    const exportPanel = canvas.getByRole('region', { name: 'Export' })
    await waitFor(() =>
      expect(within(exportPanel).getByRole('status')).toHaveTextContent(
        'with the music track',
      ),
    )
  },
}

export const MusicTrackDark: Story = {
  ...MusicTrack,
  globals: { theme: 'dark' },
}

/** A track that ends before the video does: the rest is silence, said so. */
export const MusicShortTrack: Story = {
  args: { gallery: musicGallery },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const music = await setUpMusic(canvas)
    await setSeconds(within(music), 'Start in track', 17)
    await waitFor(() =>
      expect(within(music).getByRole('status')).toHaveTextContent(
        'The track ends 3.0 s into the video, which is silent after that.',
      ),
    )
  },
}

/** The track fails to load: said so, not exported, and retried on request. */
export const MusicTrackFails: Story = {
  args: {
    gallery: {
      ...musicGallery,
      loadTrack: async () => {
        throw new Error('404')
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    const music = canvas.getByRole('region', { name: 'Music' })
    await userEvent.selectOptions(
      within(music).getByLabelText('Music'),
      'track-theme',
    )
    await waitFor(() =>
      expect(within(music).getByRole('status')).toHaveTextContent(
        'The track could not be loaded',
      ),
    )
    expect(
      within(music).getByRole('button', { name: 'Try again' }),
    ).toBeVisible()
    const exportPanel = canvas.getByRole('region', { name: 'Export' })
    expect(within(exportPanel).getByRole('status')).toHaveTextContent(
      'silent: the music track could not be loaded',
    )
  },
}

export const MusicTrackFailsDark: Story = {
  ...MusicTrackFails,
  globals: { theme: 'dark' },
}

/** RMS of `samples` over [from, to) seconds. */
function rms(samples: Float32Array, from: number, to: number) {
  let sum = 0
  const a = Math.round(from * MIX_RATE)
  const b = Math.round(to * MIX_RATE)
  for (let i = a; i < b; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / (b - a))
}

/**
 * The REAL encoder, with music. Where the browser has no H.264 encoder
 * (headless Chromium commonly), the refusal is the behaviour and nothing
 * more is checked. Where it has one, the MP4 is decoded back: an AAC track at
 * 48 kHz as long as the video, the click the track has at 2 s — started 1 s
 * in — heard at 1 s, and the last half second quieter than the middle
 * (the fade-out at the video's end).
 */
export const MusicRealExport: Story = {
  args: { gallery: musicGallery },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await setUpMusic(canvas)
    const panel = canvas.getByRole('region', { name: 'Export' })
    const { mediabunnyBackend } = await import('./meme-generator-mediabunny')
    if (!(await mediabunnyBackend.supports())) {
      await waitFor(() =>
        expect(within(panel).getByRole('status')).toHaveTextContent(
          'This browser cannot make MP4 video',
        ),
      )
      return
    }
    const button = within(panel).getByRole('button', { name: 'Export MP4' })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'), {
      timeout: 10_000,
    })
    await userEvent.click(button)
    const link = await within(panel).findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 60_000 },
    )
    const blob = await (await fetch(link.getAttribute('href')!)).blob()
    const { ALL_FORMATS, AudioBufferSink, BlobSource, Input } =
      await import('mediabunny')
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    })
    const audio = await input.getPrimaryAudioTrack()
    expect(audio?.codec).toBe('aac')
    expect(audio?.sampleRate).toBe(MIX_RATE)
    expect(audio?.numberOfChannels).toBe(2)
    const left = new Float32Array(Math.round(6.2 * MIX_RATE))
    let written = 0
    for await (const { buffer, timestamp } of new AudioBufferSink(
      audio!,
    ).buffers()) {
      const at = Math.round(timestamp * MIX_RATE)
      const data = buffer.getChannelData(0)
      left.set(data.subarray(0, Math.max(0, left.length - at)), at)
      written = Math.max(written, at + data.length)
    }
    input.dispose()
    const click = findClick(left, 0.45)
    // Where the track's 2 s click lands, against 1 s: 0 = in step.
    const offset = click === null ? null : click - 1 * MIX_RATE
    console.info('[music export] click offset (samples):', offset)
    console.info('[music export] audio samples decoded:', written)
    expect(offset).not.toBeNull()
    expect(Math.abs(offset!)).toBeLessThanOrEqual(48)
    // The fade-out: the last 0.2 s far quieter than the middle.
    expect(rms(left, 5.8, 6)).toBeLessThan(rms(left, 3.5, 4.5) * 0.3)
    expect(written).toBeGreaterThanOrEqual(Math.round(5.9 * MIX_RATE))
  },
}

/**
 * The REAL priming measurement (proof §4): the browser's AAC encoder — or
 * the add-on where it has none — encodes a click, Mediabunny decodes it back,
 * and the delay is read off. The proof measured 2112 samples for native AAC
 * on macOS and 1024 for the add-on; either is accepted, anything else fails.
 */
export const MusicPrimingMeasured: Story = {
  args: { gallery: musicGallery },
  play: async ({ canvasElement }) => {
    const { mediabunnyBackend } = await import('./meme-generator-mediabunny')
    const result = await mediabunnyBackend.prepareAudio()
    console.info('[music priming]', JSON.stringify(result))
    canvasElement.dataset.priming = JSON.stringify(result)
    expect(result).toHaveProperty('priming')
    expect([1024, 2112]).toContain((result as { priming: number }).priming)
  },
}
