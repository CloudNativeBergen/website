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
  act,
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

// Font loading, with the hook a face that lands after its timeout calls.
let lateFace = () => {}
vi.mock('./meme-generator-fonts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./meme-generator-fonts')>()
  return {
    ...actual,
    loadCanvasFonts: (
      ...args: Parameters<typeof actual.loadCanvasFonts>
    ): Promise<void> => {
      const onLate = args[2]?.onLate
      if (onLate) lateFace = onLate
      return Promise.resolve()
    },
  }
})

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
  /** Bytes each frame adds to the file; 50 kB unless set. */
  bytesPerFrame?: number
  failAt?: number
  /** Frames from this one on never settle, until the export is cancelled. */
  holdAt?: number
}

function fakeEncoder({
  supported = true,
  failAt,
  holdAt,
  bytesPerFrame = 50_000,
}: Fake = {}) {
  const added: number[] = []
  const state = { opened: 0, cancelled: 0 }
  const encoder: EncoderBackend = {
    supports: async () => supported,
    probe: async () => true,
    open: async (): Promise<EncodeSession> => {
      state.opened++
      let frames = 0
      return {
        add: (timestamp) => {
          const frame = Math.round(timestamp * 30)
          if (frame === failAt)
            return Promise.reject(new Error('EncodingError: the encoder broke'))
          if (holdAt !== undefined && frame >= holdAt)
            return new Promise(() => {})
          added.push(frame)
          frames++
          return Promise.resolve()
        },
        // This session's frames only: a second pass makes a file of its own.
        finish: async () =>
          new Blob([new Uint8Array(frames * bytesPerFrame)], {
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
    // The live region names the phase; only the bar carries the number.
    expect(status()).toHaveTextContent(/^Exporting…$/)

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

  it('makes a video shorter than LinkedIn takes, and says so', async () => {
    const { encoder } = fakeEncoder()
    openVideo(encoder)
    fireEvent.change(screen.getByLabelText('Scene 1 length (s)'), {
      target: { value: '2' },
    })
    fireEvent.blur(screen.getByLabelText('Scene 1 length (s)'))
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    fireEvent.click(exportButton())
    await screen.findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 5000 },
    )
    expect(status()).toHaveTextContent(
      'Your video is ready. It is 2.0 s long, and LinkedIn takes videos of 3 s or more.',
    )
  })

  it('marks a finished file out of date once the video changes, and current again on undo', async () => {
    const { encoder } = fakeEncoder()
    openVideo(encoder)
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    fireEvent.click(exportButton())
    await screen.findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 5000 },
    )
    // A mode switch is not a change.
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    expect(status()).toHaveTextContent('Your video is ready.')

    fireEvent.click(screen.getByRole('button', { name: 'Cloud Blue' }))
    expect(status()).toHaveTextContent(
      'The video has changed since this export. Export again to include your changes.',
    )
    expect(
      screen.getByRole('link', { name: /Download earlier export/ }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(status()).toHaveTextContent('Your video is ready.')
    expect(
      screen.getByRole('link', { name: /Download video/ }),
    ).toBeInTheDocument()
  })

  it('keeps the last good file when a re-export fails', async () => {
    const good = fakeEncoder()
    const { rerender } = render(<MemeGenerator encoder={good.encoder} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    fireEvent.click(exportButton())
    await screen.findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 5000 },
    )
    rerender(<MemeGenerator encoder={fakeEncoder({ failAt: 10 }).encoder} />)
    fireEvent.click(exportButton())
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        'The export failed. The encoder failed: Error: EncodingError: the encoder broke Your earlier export is still available.',
      ),
    )
    const link = screen.getByRole('link', { name: /Download earlier export/ })
    expect(link).toHaveAttribute('href', 'blob:video')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('marks a finished file out of date when a late font face repaints the video', async () => {
    const { encoder } = fakeEncoder()
    openVideo(encoder)
    fireEvent.change(screen.getAllByPlaceholderText('Enter your text...')[0], {
      target: { value: 'Hello' },
    })
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    fireEvent.click(exportButton())
    await screen.findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 5000 },
    )
    act(() => lateFace())
    expect(status()).toHaveTextContent(
      'The video has changed since this export.',
    )
  })

  it("says when a file is under LinkedIn's smallest size", async () => {
    // 3 s of 800-byte frames: 72,000 bytes, exactly 192 kbit/s.
    const { encoder } = fakeEncoder({ bytesPerFrame: 800 })
    openVideo(encoder)
    await waitFor(() =>
      expect(exportButton()).not.toHaveAttribute('aria-disabled'),
    )
    fireEvent.click(exportButton())
    await screen.findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 5000 },
    )
    expect(status()).toHaveTextContent(
      'Your video is ready. It is 70 KB, and LinkedIn takes files of 75 KB or more.',
    )
  })
})
