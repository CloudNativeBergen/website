/**
 * @vitest-environment jsdom
 *
 * Export to MP4 (#1177), through the editor, with an encoder the test
 * controls. The loop's rules are covered by meme-generator-export.test; the
 * real encoder by the stories and a desktop player. This pins what the
 * organizer is shown, and that frame n is painted at frame n's time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import type { Animation, MemeAssets, MemeDesign } from './meme-generator-draw'
import type { EncodeSession, EncoderBackend } from './meme-generator-export'

const drawDesign =
  vi.fn<
    (
      ctx: unknown,
      design: MemeDesign,
      assets: MemeAssets,
      time: number,
      animation?: Animation,
    ) => void
  >()
vi.mock('./meme-generator-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-draw')>()),
  drawDesign: (...args: Parameters<typeof drawDesign>) => drawDesign(...args),
}))

import { MemeGenerator } from './MemeGenerator'

beforeEach(() => {
  drawDesign.mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as unknown as CanvasRenderingContext2D,
  )
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:video'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface Fake {
  supported?: boolean
  failAt?: number
  /** Frames from this one on never settle, until the export is cancelled. */
  holdAt?: number
}

function fakeEncoder({ supported = true, failAt, holdAt }: Fake = {}) {
  const added: number[] = []
  const state = { opened: 0, cancelled: 0 }
  const encoder: EncoderBackend = {
    supports: async () => supported,
    probe: async () => true,
    open: async (): Promise<EncodeSession> => {
      state.opened++
      return {
        add: (timestamp) => {
          const frame = Math.round(timestamp * 30)
          if (frame === failAt)
            return Promise.reject(new Error('EncodingError: the encoder broke'))
          if (holdAt !== undefined && frame >= holdAt)
            return new Promise(() => {})
          added.push(frame)
          return Promise.resolve()
        },
        // 50 kB a frame: comfortably over the bitrate floor.
        finish: async () =>
          new Blob([new Uint8Array(added.length * 50_000)], {
            type: 'video/mp4',
          }),
        cancel: async () => {
          state.cancelled++
        },
      }
    },
  }
  return { encoder, added, state }
}

const exportButton = () => screen.getByRole('button', { name: 'Export MP4' })
const status = () =>
  within(screen.getByRole('region', { name: 'Export' })).getByRole('status')

function openVideo(encoder: EncoderBackend) {
  render(<MemeGenerator encoder={encoder} />)
  fireEvent.click(screen.getByRole('button', { name: 'Video' }))
}

describe('Export MP4', () => {
  it('paints every frame at its own time and offers the file to download', async () => {
    const { encoder, added } = fakeEncoder()
    openVideo(encoder)
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    drawDesign.mockClear()
    fireEvent.click(exportButton())

    // 180 frames, each handed back to the event loop every five.
    const link = await screen.findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 5000 },
    )
    expect(link).toHaveAttribute('href', 'blob:video')
    expect(link).toHaveAttribute('download', 'studio-video.mp4')
    expect(link).toHaveTextContent('9.0 MB, 6.0 s')
    // Six seconds at 30 frames a second, in order.
    expect(added).toEqual(Array.from({ length: 180 }, (_, n) => n))
    // Each frame drawn at its scene's own time: frame 100 is 0.333 s into
    // scene 2.
    const times = drawDesign.mock.calls.map(([, , , time]) => time)
    expect(times).toHaveLength(180)
    expect(times[100]).toBeCloseTo(100 / 30 - 3, 10)
    expect(status()).toHaveTextContent('Your video is ready.')
  })

  it('says why and produces nothing when the encoder does not support it', async () => {
    const { encoder, state } = fakeEncoder({ supported: false })
    openVideo(encoder)
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        'This browser cannot make MP4 video. Use Chrome, Edge or Safari on a computer.',
      ),
    )
    expect(exportButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(exportButton())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.opened).toBe(0)
    expect(screen.queryByRole('link', { name: /Download video/ })).toBeNull()
  })

  it('shows an encoder error that happens mid-export, and no file', async () => {
    const { encoder, state } = fakeEncoder({ failAt: 40 })
    openVideo(encoder)
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    fireEvent.click(exportButton())
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        'The export failed. The encoder failed: Error: EncodingError: the encoder broke',
      ),
    )
    expect(state.cancelled).toBe(1)
    expect(screen.queryByRole('link', { name: /Download video/ })).toBeNull()
  })

  it('shows progress, and cancel stops the export and frees the encoder', async () => {
    const { encoder, state, added } = fakeEncoder({ holdAt: 45 })
    openVideo(encoder)
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    fireEvent.click(exportButton())
    const bar = await screen.findByRole('progressbar', {
      name: 'Export progress',
    })
    // 45 of 90 frames in: half way.
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '50'))
    expect(status()).toHaveTextContent('Exporting… 50 %')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(status()).toHaveTextContent('Export cancelled.'))
    expect(state.cancelled).toBe(1)
    expect(added).toHaveLength(45)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('carries on, and keeps its file, while the organizer looks at Image mode', async () => {
    const { encoder, state } = fakeEncoder()
    openVideo(encoder)
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    fireEvent.click(exportButton())
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await screen.findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 5000 },
    )
    expect(state.cancelled).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    expect(screen.getByRole('link', { name: /Download video/ })).toBeVisible()
  })

  it('asks the encoder about support only once Video mode is shown', async () => {
    const { encoder } = fakeEncoder()
    const supports = vi.spyOn(encoder, 'supports')
    render(<MemeGenerator encoder={encoder} />)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(supports).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await waitFor(() => expect(supports).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(supports).toHaveBeenCalledTimes(1)
  })
})
