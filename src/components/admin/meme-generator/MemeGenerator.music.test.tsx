/**
 * @vitest-environment jsdom
 *
 * A video's music track in the editor (#1179): picked from the gallery,
 * fetched from the right source, saved with the project and reopened from
 * it. Decoding is replaced — jsdom has no audio — and proven in the
 * real-browser story (MemeGenerator.music.stories.tsx); the mix, the player
 * and the export pipeline have their own tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import type { BackgroundGallery, TrackSource } from './meme-generator-gallery'
import type { VideoProjects } from './meme-generator-project'
import type { EncoderBackend } from './meme-generator-export'
import type { OpenedProject, VideoProjectRow } from '@/lib/video-project'
import { DEFAULT_DESIGN } from './meme-generator-draw'

vi.mock('./meme-generator-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-draw')>()),
  drawDesign: () => {},
}))
/** What the editor asks of the preview's player. */
const playerCalls = vi.hoisted(() => [] as string[])
vi.mock('./meme-generator-track-player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-track-player')>()),
  createTrackPlayer: () => {
    const calls = playerCalls
    return {
      load: (mix: unknown) => calls.push(mix ? 'load' : 'load:none'),
      play: () => calls.push('play'),
      pause: () => {},
      seek: () => {},
      setLoop: () => {},
      setVolume: (volume: number) => calls.push(`volume:${volume}`),
      time: () => null,
      dispose: () => {},
    }
  },
  // Twenty seconds of silence at 48 kHz, whatever the bytes.
  decodeTrack: async () => {
    const channels = [
      new Float32Array(20 * 48_000),
      new Float32Array(20 * 48_000),
    ]
    decodedRefs.push(new WeakRef(channels[0]))
    return channels
  },
}))
/** Every decoded track, weakly: whether the editor still holds one. */
const decodedRefs: WeakRef<Float32Array>[] = []
/** A full garbage collection, without the --expose-gc flag. */
const collectGarbage = () => {
  setFlagsFromString('--expose-gc')
  ;(runInNewContext('gc') as () => void)()
}

import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { MemeGenerator } from './MemeGenerator'

const PROJECT: OpenedProject = {
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
      design: structuredClone({
        ...DEFAULT_DESIGN,
        background: { color: '#1D4ED8', image: null },
      }),
    },
  ],
  // Its gallery entry was deleted: the project holds the file alone.
  track: {
    fileId: 'file-theme',
    title: 'Old theme',
    rights: null,
    start: 4,
    volume: 0.5,
    fadeIn: 0.5,
    fadeOut: 1.5,
  },
}

function fakeProjects() {
  return {
    list: vi.fn(async (): Promise<VideoProjectRow[]> => []),
    open: vi.fn(async (id: string) => ({ ...PROJECT, _id: id })),
    create: vi.fn(async (input: Parameters<VideoProjects['create']>[0]) => ({
      _id: 'vp-new',
      _rev: 'rev-2',
      scenes: input.scenes.map((s) => ({ key: s.key, fileId: null })),
      trackFileId: input.track ? 'file-picked' : null,
    })),
    save: vi.fn(async (input: Parameters<VideoProjects['save']>[0]) => ({
      _rev: 'rev-3',
      scenes: input.scenes.map((s) => ({ key: s.key, fileId: null })),
      trackFileId: input.track?.fileId ?? null,
      released: [],
    })),
    duplicate: vi.fn(async () => ({ _id: 'vp-copy' })),
    delete: vi.fn(async () => ({
      released: [] as string[],
      unsaveable: [] as { fileId: string; galleryAssetId: string | null }[],
    })),
  } satisfies VideoProjects
}

function fakeGallery() {
  return {
    images: async () => [],
    resolve: async () => {
      throw new Error('none')
    },
    keep: async () => ({ _id: 'kept' }),
    tracks: vi.fn(async () => [
      { _id: 'asset-theme', title: 'Theme', durationSeconds: 20 },
    ]),
    loadTrack: vi.fn<
      (source: TrackSource, signal: AbortSignal) => Promise<ArrayBuffer>
    >(async () => new ArrayBuffer(8)),
  } satisfies BackgroundGallery
}

/** An encoder that says yes: the export panel then says what it would make. */
const encoder: EncoderBackend = {
  supports: async () => true,
  probe: async () => true,
  prepareAudio: async () => ({ priming: 0 }),
  open: async () => {
    throw new Error('not exported here')
  },
}

beforeEach(() => {
  window.history.replaceState(null, '', window.location.href)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as unknown as CanvasRenderingContext2D,
  )
})
afterEach(() => vi.restoreAllMocks())

const music = () => screen.getByRole('region', { name: 'Music' })
const project = () => screen.getByRole('region', { name: 'Project' })
const save = () =>
  fireEvent.click(within(project()).getByRole('button', { name: 'Save' }))

describe('a video’s music', () => {
  it('picks a gallery track, fetches it by its gallery entry, and saves it with the project', async () => {
    const gallery = fakeGallery()
    const projects = fakeProjects()
    render(
      <MemeGenerator gallery={gallery} projects={projects} encoder={encoder} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await within(music()).findByRole('option', { name: 'Theme (0:20)' })
    fireEvent.change(within(music()).getByLabelText('Music'), {
      target: { value: 'asset-theme' },
    })
    expect(gallery.loadTrack).toHaveBeenCalledWith(
      { asset: 'asset-theme' },
      expect.any(AbortSignal),
    )
    await within(music()).findByText(
      'Plays from 0:00 of 0:20, and is cut at the end of the video.',
    )
    const exportStatus = within(
      screen.getByRole('region', { name: 'Export' }),
    ).getByRole('status')
    await waitFor(() =>
      expect(exportStatus).toHaveTextContent('with the music track'),
    )

    save()
    await within(project()).findByText('All changes saved')
    expect(projects.create).toHaveBeenCalledWith(
      expect.objectContaining({
        track: {
          galleryAssetId: 'asset-theme',
          start: 0,
          volume: 0.8,
          fadeIn: 1,
          fadeOut: 2,
        },
      }),
    )

    // A change to how it sounds is an unsaved change, and the next save
    // carries the file the project now holds.
    fireEvent.change(within(music()).getByLabelText(/Volume/), {
      target: { value: '40' },
    })
    expect(within(project()).getByText('Unsaved changes')).toBeInTheDocument()
    save()
    await within(project()).findByText('All changes saved')
    // The samples already decoded are the file the project now holds.
    expect(gallery.loadTrack).toHaveBeenCalledTimes(1)
    expect(projects.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'vp-new',
        track: expect.objectContaining({
          galleryAssetId: 'asset-theme',
          fileId: 'file-picked',
          volume: 0.4,
        }),
      }),
    )
  })

  it('reopens a project’s track, fetched through the project once its gallery entry is gone', async () => {
    const gallery = fakeGallery()
    const projects = fakeProjects()
    render(
      <MemeGenerator
        gallery={gallery}
        projects={projects}
        encoder={encoder}
        initialProjectId="vp-1"
      />,
    )
    await screen.findByDisplayValue('Launch teaser')
    await waitFor(() =>
      expect(within(music()).getByLabelText('Music')).toHaveDisplayValue(
        'Old theme',
      ),
    )
    expect(gallery.loadTrack).toHaveBeenCalledWith(
      {
        project: 'vp-1',
        file: 'file-theme',
      },
      expect.any(AbortSignal),
    )
    expect(within(music()).getByLabelText('Start in track')).toHaveValue('4.0')
    expect(within(project()).getByText('All changes saved')).toBeInTheDocument()

    fireEvent.change(within(music()).getByLabelText('Fade in'), {
      target: { value: '0.8' },
    })
    fireEvent.blur(within(music()).getByLabelText('Fade in'))
    save()
    await waitFor(() => expect(projects.save).toHaveBeenCalled())
    expect(projects.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        track: {
          fileId: 'file-theme',
          start: 4,
          volume: 0.5,
          fadeIn: 0.8,
          fadeOut: 1.5,
        },
      }),
    )
  })

  it('removes the track, and a save removes it from the project', async () => {
    const gallery = fakeGallery()
    const projects = fakeProjects()
    render(
      <MemeGenerator
        gallery={gallery}
        projects={projects}
        encoder={encoder}
        initialProjectId="vp-1"
      />,
    )
    await screen.findByDisplayValue('Launch teaser')
    fireEvent.change(within(music()).getByLabelText('Music'), {
      target: { value: '' },
    })
    expect(within(project()).getByText('Unsaved changes')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Export' })).getByRole(
          'status',
        ),
      ).toHaveTextContent('frames a second, silent.'),
    )
    save()
    await waitFor(() => expect(projects.save).toHaveBeenCalled())
    expect(projects.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ track: null }),
    )
  })

  it('drops a track only the deleted project held, and says so', async () => {
    const gallery = fakeGallery()
    const projects = fakeProjects()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <MemeGenerator
        gallery={gallery}
        projects={projects}
        encoder={encoder}
        initialProjectId="vp-1"
      />,
    )
    await screen.findByDisplayValue('Launch teaser')
    fireEvent.click(within(project()).getByRole('button', { name: /Delete/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }))
    expect(
      (
        await within(project()).findAllByText(
          /Its music track was only in that project/,
        )
      )[0],
    ).toBeInTheDocument()
    expect(within(music()).getByLabelText('Music')).toHaveDisplayValue(
      'No music',
    )
    confirm.mockRestore()
  })

  it('keeps a gallery track through a project delete, and saves it anew by its gallery entry', async () => {
    const gallery = fakeGallery()
    const projects = fakeProjects()
    projects.open.mockResolvedValue({
      ...PROJECT,
      track: { ...PROJECT.track!, galleryAssetId: 'asset-theme' },
    })
    render(
      <MemeGenerator
        gallery={gallery}
        projects={projects}
        encoder={encoder}
        initialProjectId="vp-1"
      />,
    )
    await screen.findByDisplayValue('Launch teaser')
    fireEvent.click(within(project()).getByRole('button', { name: /Delete/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }))
    await within(project()).findAllByText('Project deleted.')
    save()
    await waitFor(() => expect(projects.create).toHaveBeenCalled())
    expect(projects.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        track: {
          galleryAssetId: 'asset-theme',
          start: 4,
          volume: 0.5,
          fadeIn: 0.5,
          fadeOut: 1.5,
        },
      }),
    )
  })

  it('fetches each project’s own file when two name one gallery entry whose file was replaced', async () => {
    const gallery = fakeGallery()
    const projects = fakeProjects()
    const holding = (id: string, fileId: string): OpenedProject => ({
      ...PROJECT,
      _id: id,
      title: id,
      track: { ...PROJECT.track!, fileId, galleryAssetId: 'asset-theme' },
    })
    projects.open.mockImplementation(async (id: string) =>
      id === 'vp-1' ? holding('vp-1', 'file-old') : holding('vp-2', 'file-new'),
    )
    projects.list.mockResolvedValue(
      ['vp-1', 'vp-2'].map((id) => ({
        _id: id,
        title: id,
        scope: 'organization' as const,
        edition: null,
        updatedAt: '2026-09-26T10:00:00Z',
        scenes: 1,
      })),
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <MemeGenerator
        gallery={gallery}
        projects={projects}
        encoder={encoder}
        initialProjectId="vp-1"
      />,
    )
    await screen.findByDisplayValue('vp-1')
    await waitFor(() =>
      expect(gallery.loadTrack).toHaveBeenLastCalledWith(
        {
          project: 'vp-1',
          file: 'file-old',
        },
        expect.any(AbortSignal),
      ),
    )
    await within(project()).findByRole('option', { name: /vp-2/ })
    fireEvent.change(within(project()).getByLabelText('Open a saved project'), {
      target: { value: 'vp-2' },
    })
    await screen.findByDisplayValue('vp-2')
    await waitFor(() =>
      expect(gallery.loadTrack).toHaveBeenLastCalledWith(
        {
          project: 'vp-2',
          file: 'file-new',
        },
        expect.any(AbortSignal),
      ),
    )
    confirm.mockRestore()
  })

  it('drops a gallery track the delete reports as held by the project alone', async () => {
    const gallery = fakeGallery()
    const projects = fakeProjects()
    projects.open.mockResolvedValue({
      ...PROJECT,
      track: { ...PROJECT.track!, galleryAssetId: 'asset-theme' },
    })
    // Its gallery entry was deleted after the project was opened.
    projects.delete.mockResolvedValue({
      released: [],
      unsaveable: [{ fileId: 'file-theme', galleryAssetId: 'asset-theme' }],
    })
    render(
      <MemeGenerator
        gallery={gallery}
        projects={projects}
        encoder={encoder}
        initialProjectId="vp-1"
      />,
    )
    await screen.findByDisplayValue('Launch teaser')
    fireEvent.click(within(project()).getByRole('button', { name: /Delete/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }))
    await within(project()).findAllByText(
      /Its music track was only in that project/,
    )
    expect(within(music()).getByLabelText('Music')).toHaveDisplayValue(
      'No music',
    )
  })

  it('puts the track under undo and redo, a volume drag as one step', async () => {
    const gallery = fakeGallery()
    render(<MemeGenerator gallery={gallery} encoder={encoder} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await within(music()).findByRole('option', { name: 'Theme (0:20)' })
    fireEvent.change(within(music()).getByLabelText('Music'), {
      target: { value: 'asset-theme' },
    })
    await within(music()).findByText(/Plays from/)
    const volume = () => within(music()).getByLabelText(/Volume/)
    // A drag: many values within a second.
    for (const value of ['70', '60', '50', '40'])
      fireEvent.change(volume(), { target: { value } })
    fireEvent.change(within(music()).getByLabelText('Fade in'), {
      target: { value: '0' },
    })
    fireEvent.blur(within(music()).getByLabelText('Fade in'))
    expect(within(music()).getByLabelText('Fade in')).toHaveValue('0.0')

    const undo = () =>
      fireEvent.click(screen.getByRole('button', { name: /^Undo/ }))
    const redo = () =>
      fireEvent.click(screen.getByRole('button', { name: /^Redo/ }))
    undo()
    expect(within(music()).getByLabelText('Fade in')).toHaveValue('1.0')
    expect(volume()).toHaveValue('40')
    undo()
    expect(volume()).toHaveValue('80')
    undo()
    expect(within(music()).getByLabelText('Music')).toHaveDisplayValue(
      'No music',
    )
    redo()
    redo()
    expect(volume()).toHaveValue('40')
    // Fetched once: undo and redo bring back the samples already decoded.
    expect(gallery.loadTrack).toHaveBeenCalledTimes(1)
  })

  it('says why an export came out silent: an unmeasurable encoder, not the browser', async () => {
    const gallery = fakeGallery()
    const exporting: EncoderBackend = {
      supports: async () => true,
      probe: async () => true,
      prepareAudio: async () => ({ silent: 'unmeasured' }),
      open: async () => ({
        add: async () => {},
        finish: async () => new Blob([new Uint8Array(1_000_000)]),
        cancel: async () => {},
      }),
    }
    render(<MemeGenerator gallery={gallery} encoder={exporting} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await within(music()).findByRole('option', { name: 'Theme (0:20)' })
    fireEvent.change(within(music()).getByLabelText('Music'), {
      target: { value: 'asset-theme' },
    })
    await within(music()).findByText(/Plays from/)
    const panel = screen.getByRole('region', { name: 'Export' })
    const button = within(panel).getByRole('button', { name: 'Export MP4' })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    fireEvent.click(button)
    const status = within(panel).getByRole('status')
    await waitFor(
      () =>
        expect(status).toHaveTextContent(
          'The music could not be lined up with the picture on this browser’s encoder, so the video was made silent.',
        ),
      { timeout: 5000 },
    )
    expect(status).not.toHaveTextContent('Chrome')
  })

  it('aborts a track still loading when another is picked, and on leaving', async () => {
    const gallery = fakeGallery()
    const signals: AbortSignal[] = []
    gallery.loadTrack.mockImplementation((_source, signal) => {
      signals.push(signal)
      return new Promise<ArrayBuffer>(() => {})
    })
    gallery.tracks.mockResolvedValue([
      { _id: 'asset-theme', title: 'Theme', durationSeconds: 20 },
      { _id: 'asset-outro', title: 'Outro', durationSeconds: 20 },
    ])
    const { unmount } = render(
      <MemeGenerator gallery={gallery} encoder={encoder} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await within(music()).findByRole('option', { name: 'Outro (0:20)' })
    const select = within(music()).getByLabelText('Music')
    fireEvent.change(select, { target: { value: 'asset-theme' } })
    fireEvent.change(select, { target: { value: 'asset-outro' } })
    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    unmount()
    expect(signals[1].aborted).toBe(true)
  })

  it('warns that Safari may clip the very start only when there is no fade-in', async () => {
    render(<MemeGenerator gallery={fakeGallery()} encoder={encoder} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await within(music()).findByRole('option', { name: 'Theme (0:20)' })
    fireEvent.change(within(music()).getByLabelText('Music'), {
      target: { value: 'asset-theme' },
    })
    await within(music()).findByText(/Plays from/)
    const clip = /Safari can drop the first 20 ms or so/
    expect(within(music()).queryByText(clip)).toBeNull()
    fireEvent.change(within(music()).getByLabelText('Fade in'), {
      target: { value: '0' },
    })
    fireEvent.blur(within(music()).getByLabelText('Fade in'))
    expect(within(music()).getByText(clip)).toBeInTheDocument()
  })

  it('lets go of the last track’s samples as soon as another is picked, not once it has decoded', async () => {
    const gallery = fakeGallery()
    gallery.tracks.mockResolvedValue([
      { _id: 'asset-theme', title: 'Theme', durationSeconds: 20 },
      { _id: 'asset-outro', title: 'Outro', durationSeconds: 20 },
    ])
    render(<MemeGenerator gallery={gallery} encoder={encoder} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await within(music()).findByRole('option', { name: 'Outro (0:20)' })
    const select = within(music()).getByLabelText('Music')
    fireEvent.change(select, { target: { value: 'asset-theme' } })
    await within(music()).findByText(/Plays from/)
    const first = decodedRefs[decodedRefs.length - 1]
    // The next track's fetch never finishes.
    gallery.loadTrack.mockImplementation(() => new Promise(() => {}))
    fireEvent.change(select, { target: { value: 'asset-outro' } })
    await within(music()).findByText('Loading the track…')
    // Two more commits, so no alternate fiber still holds the old props.
    for (const value of ['50', '60'])
      fireEvent.change(within(music()).getByLabelText(/Volume/), {
        target: { value },
      })
    await new Promise((resolve) => setTimeout(resolve, 0))
    collectGarbage()
    expect(first.deref()).toBeUndefined()
  })

  it('changes the preview’s volume without rebuilding the mix', async () => {
    render(<MemeGenerator gallery={fakeGallery()} encoder={encoder} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await within(music()).findByRole('option', { name: 'Theme (0:20)' })
    fireEvent.change(within(music()).getByLabelText('Music'), {
      target: { value: 'asset-theme' },
    })
    await within(music()).findByText(/Plays from/)
    playerCalls.length = 0
    for (const value of ['70', '55', '40'])
      fireEvent.change(within(music()).getByLabelText(/Volume/), {
        target: { value },
      })
    expect(playerCalls).toEqual(['volume:0.7', 'volume:0.55', 'volume:0.4'])
  })

  it('says when the gallery’s tracks could not be listed, even with a track playing, and lists them again on request', async () => {
    const gallery = fakeGallery()
    gallery.tracks.mockRejectedValueOnce(new Error('offline'))
    render(
      <MemeGenerator
        gallery={gallery}
        projects={fakeProjects()}
        encoder={encoder}
        initialProjectId="vp-1"
      />,
    )
    await screen.findByDisplayValue('Launch teaser')
    const status = within(music()).getByRole('status')
    await waitFor(() =>
      expect(status).toHaveTextContent(
        'The gallery’s tracks could not be listed.',
      ),
    )
    fireEvent.click(
      within(music()).getByRole('button', { name: 'List tracks again' }),
    )
    expect(
      await within(music()).findByRole('option', { name: 'Theme (0:20)' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(status).toHaveTextContent(/Plays from 0:04/))
  })
})
