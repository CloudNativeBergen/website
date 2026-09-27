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
import type { BackgroundGallery } from './meme-generator-gallery'
import type { VideoProjects } from './meme-generator-project'
import type { EncoderBackend } from './meme-generator-export'
import type { OpenedProject, VideoProjectRow } from '@/lib/video-project'
import { DEFAULT_DESIGN } from './meme-generator-draw'

vi.mock('./meme-generator-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-draw')>()),
  drawDesign: () => {},
}))
vi.mock('./meme-generator-track-player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-track-player')>()),
  // Twenty seconds of silence at 48 kHz, whatever the bytes.
  decodeTrack: async () => [
    new Float32Array(20 * 48_000),
    new Float32Array(20 * 48_000),
  ],
}))

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
    loadTrack: vi.fn(async () => new ArrayBuffer(8)),
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
    expect(gallery.loadTrack).toHaveBeenCalledWith({ asset: 'asset-theme' })
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
    expect(gallery.loadTrack).toHaveBeenCalledWith({
      project: 'vp-1',
      file: 'file-theme',
    })
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
      expect(gallery.loadTrack).toHaveBeenLastCalledWith({
        project: 'vp-1',
        file: 'file-old',
      }),
    )
    await within(project()).findByRole('option', { name: /vp-2/ })
    fireEvent.change(within(project()).getByLabelText('Open a saved project'), {
      target: { value: 'vp-2' },
    })
    await screen.findByDisplayValue('vp-2')
    await waitFor(() =>
      expect(gallery.loadTrack).toHaveBeenLastCalledWith({
        project: 'vp-2',
        file: 'file-new',
      }),
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
})
