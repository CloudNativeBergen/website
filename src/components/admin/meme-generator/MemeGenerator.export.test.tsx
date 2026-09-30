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
import type { VideoProjects } from './meme-generator-project'
import {
  GallerySaveContext,
  type GallerySave,
} from '@/components/common/image-capture'
import type { OpenedProject } from '@/lib/video-project'

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
import { DEFAULT_DESIGN } from './meme-generator-draw'

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
    prepareAudio: async () => ({ priming: 0 }),
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

  it('offers a retry when the encoder could not be loaded, instead of calling the browser unsupported', async () => {
    const { encoder } = fakeEncoder()
    const supports = vi
      .spyOn(encoder, 'supports')
      .mockRejectedValueOnce(
        new Error('Failed to fetch dynamically imported module'),
      )
    openVideo(encoder)
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        'The video encoder could not be loaded. Check your connection, then press Export MP4 to try again.',
      ),
    )
    expect(exportButton()).not.toHaveAttribute('aria-disabled')
    fireEvent.click(exportButton())
    await waitFor(() => expect(supports).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        'H.264, 1080 × 1080, 30 frames a second, silent.',
      ),
    )
  })
})

/** A saved-project store with one project in it, `vp-1`. */
function fakeProjects(): VideoProjects {
  const opened: OpenedProject = {
    _id: 'vp-1',
    _rev: 'rev-1',
    title: 'Launch teaser',
    scope: 'organization',
    edition: null,
    scenes: [
      {
        key: 's-1',
        duration: 3,
        transition: 'cut',
        motion: { drift: false, elements: [] },
        design: {
          ...structuredClone(DEFAULT_DESIGN),
          background: { color: '#1D4ED8', image: null },
        },
      },
    ],
    track: null,
  }
  return {
    list: vi.fn(async () => []),
    open: vi.fn(async () => opened),
    create: vi.fn(),
    save: vi.fn(),
    duplicate: vi.fn(),
    delete: vi.fn(),
  } as unknown as VideoProjects
}

function withGallery(node: React.ReactNode) {
  const gallery: GallerySave = {
    busy: false,
    save: vi.fn(),
    saveVideo: vi.fn(),
  }
  const ui = (
    <GallerySaveContext.Provider value={gallery}>
      {node}
    </GallerySaveContext.Provider>
  )
  return { gallery, ui }
}

async function exportOnce() {
  await waitFor(() =>
    expect(exportButton()).not.toHaveAttribute('aria-disabled'),
  )
  fireEvent.click(exportButton())
  await screen.findByRole('link', { name: /Download video/ }, { timeout: 5000 })
}

const saveButton = () =>
  screen.queryByRole('button', { name: 'Save to gallery' })

describe('Save an export to the gallery (#1182)', () => {
  it('hands the exported file, its length and an unsaved origin to the gallery', async () => {
    const { encoder } = fakeEncoder()
    const { gallery, ui } = withGallery(
      <MemeGenerator encoder={encoder} projects={fakeProjects()} />,
    )
    render(ui)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    // Nothing to save before there is a file.
    expect(saveButton()).toBeNull()
    await exportOnce()
    fireEvent.click(saveButton()!)
    expect(gallery.saveVideo).toHaveBeenCalledTimes(1)
    const [video, origin] = vi.mocked(gallery.saveVideo).mock.calls[0]
    // 90 frames of 50 kB: the encoder's own file, not a copy of something.
    expect(video.blob).toBeInstanceOf(Blob)
    expect(video.blob.size).toBe(90 * 50_000)
    expect(origin).toEqual({ title: 'Untitled video', projectId: null })
  })

  it('records the project the video was opened from, and its title', async () => {
    const { encoder } = fakeEncoder()
    const { gallery, ui } = withGallery(
      <MemeGenerator
        encoder={encoder}
        projects={fakeProjects()}
        initialProjectId="vp-1"
      />,
    )
    render(ui)
    await screen.findByDisplayValue('Launch teaser')
    await exportOnce()
    fireEvent.click(saveButton()!)
    const [, origin] = vi.mocked(gallery.saveVideo).mock.calls[0]
    expect(origin).toEqual({ title: 'Launch teaser', projectId: 'vp-1' })
  })

  it('files a stale export under the project it was exported from, not the one open now', async () => {
    const { encoder } = fakeEncoder()
    const { gallery, ui } = withGallery(
      <MemeGenerator
        encoder={encoder}
        projects={fakeProjects()}
        initialProjectId="vp-1"
      />,
    )
    render(ui)
    await screen.findByDisplayValue('Launch teaser')
    await exportOnce()
    // On to a new, unsaved video: the file on offer is now out of date.
    fireEvent.click(screen.getByRole('button', { name: 'New video' }))
    await screen.findByRole('link', { name: /Download earlier export/ })
    fireEvent.click(saveButton()!)
    const [, origin] = vi.mocked(gallery.saveVideo).mock.calls[0]
    expect(origin).toEqual({ title: 'Launch teaser', projectId: 'vp-1' })
  })

  it('files a current export under the title the project has now', async () => {
    const { encoder } = fakeEncoder()
    const { gallery, ui } = withGallery(
      <MemeGenerator
        encoder={encoder}
        projects={fakeProjects()}
        initialProjectId="vp-1"
      />,
    )
    render(ui)
    const title = await screen.findByDisplayValue('Launch teaser')
    await exportOnce()
    // A rename is not a change to the video: the file is still current.
    fireEvent.change(title, { target: { value: 'Keynote teaser' } })
    expect(screen.getByRole('link', { name: /Download video/ })).toBeTruthy()
    fireEvent.click(saveButton()!)
    const [, origin] = vi.mocked(gallery.saveVideo).mock.calls[0]
    expect(origin).toEqual({ title: 'Keynote teaser', projectId: 'vp-1' })
  })

  it('offers no Save to gallery without the gallery, or outside the studio', async () => {
    const bare = fakeEncoder()
    const { unmount } = render(
      <MemeGenerator encoder={bare.encoder} projects={fakeProjects()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await exportOnce()
    expect(saveButton()).toBeNull()
    unmount()

    // A gallery but no saved projects: not the studio page.
    const noProjects = withGallery(
      <MemeGenerator encoder={fakeEncoder().encoder} />,
    )
    render(noProjects.ui)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await exportOnce()
    expect(saveButton()).toBeNull()
  })

  it('draws the poster from frame 0 of the export, as a JPEG', async () => {
    // One context per canvas, so the poster's paint can be told apart from
    // the preview's.
    const contexts = new WeakMap<HTMLCanvasElement, object>()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        if (!contexts.has(this)) contexts.set(this, {})
        return contexts.get(this) as CanvasRenderingContext2D
      },
    )
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, callback, type) {
        callback(new Blob(['poster'], { type }))
      })
    const { encoder } = fakeEncoder()
    const { gallery, ui } = withGallery(
      <MemeGenerator encoder={encoder} projects={fakeProjects()} />,
    )
    render(ui)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await exportOnce()
    fireEvent.click(saveButton()!)
    const [video] = vi.mocked(gallery.saveVideo).mock.calls[0]
    // The export ended on its last frame.
    expect(drawDesign.mock.lastCall![3]).toBeCloseTo(89 / 30, 10)
    drawDesign.mockClear()

    const poster = await video.poster()
    expect(poster.type).toBe('image/jpeg')
    expect(toBlob).toHaveBeenCalledTimes(1)
    expect(toBlob.mock.calls[0].slice(1)).toEqual(['image/jpeg', 0.92])
    const canvas = toBlob.mock.contexts[0] as HTMLCanvasElement
    expect(canvas.width).toBe(1080)
    // Frame 0, painted onto the canvas the poster is taken from.
    expect(drawDesign).toHaveBeenCalledTimes(1)
    const [ctx, , , time] = drawDesign.mock.calls[0]
    expect(ctx).toBe(contexts.get(canvas))
    expect(time).toBe(0)
  })

  it('says so when the poster cannot be encoded', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(null),
    )
    const { encoder } = fakeEncoder()
    const { gallery, ui } = withGallery(
      <MemeGenerator encoder={encoder} projects={fakeProjects()} />,
    )
    render(ui)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await exportOnce()
    fireEvent.click(saveButton()!)
    const [video] = vi.mocked(gallery.saveVideo).mock.calls[0]
    await expect(video.poster()).rejects.toThrow(
      'The first frame could not be encoded as an image.',
    )
  })
})
