// @vitest-environment jsdom
/**
 * "Save to gallery" on a studio card (#1164, docs/MARKETING_ASSETS_SPEC.md
 * §4.2), through the REAL DownloadableImage, captureImage and dialog, with and
 * without a render Task open. Mocked at the boundaries: html2canvas (the
 * raster), the gallery uploader (injected; the last test runs the real
 * `blobAssetUploader` with `@vercel/blob/client` and `fetch` mocked), `fetch`
 * for the Task's own route, `URL.createObjectURL`/`revokeObjectURL`, and the
 * tRPC hooks. Blob and the server are never exercised here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import {
  useGallerySave,
  type ExportedVideo,
  type StudioCard,
  type VideoOrigin,
} from '@/components/common/image-capture'
import { StudioTaskProvider } from '../StudioTaskProvider'
import { StudioGalleryProvider } from './StudioGalleryProvider'

const mocks = vi.hoisted(() => ({
  rasterize: vi.fn(),
  uploader: vi.fn(),
  fetch: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  blobUpload: vi.fn(),
  invalidateList: vi.fn(),
  invalidateFilters: vi.fn(),
  revoke: vi.fn(),
  pixels: 'rendered card pixels' as BlobPart,
}))
vi.mock('html2canvas-pro', () => ({ default: mocks.rasterize }))
vi.mock('@vercel/blob/client', () => ({ upload: mocks.blobUpload }))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    search: {
      unified: {
        useQuery: ({ query }: { query: string }) => ({
          data: query
            ? { speakers: [{ _id: 'ada', name: 'Ada Lovelace' }] }
            : undefined,
          isFetching: false,
        }),
      },
    },
    useUtils: () => ({
      marketingAsset: {
        list: { invalidate: mocks.invalidateList },
        filters: { invalidate: mocks.invalidateFilters },
      },
    }),
    marketing: {
      task: {
        get: {
          useQuery: () => ({
            data: {
              task: {
                _id: 'render-1',
                _rev: 'rev',
                title: 'Save the date',
                kind: 'studioRender',
                subject: null,
              },
            },
            refetch: mocks.refetch,
          }),
        },
        attachAsset: { useMutation: () => ({ mutateAsync: mocks.mutate }) },
      },
    },
  },
}))

const SPEAKER_CARD: StudioCard = {
  tab: 'speakers',
  title: 'Ada Lovelace – speaker card',
  alt: 'Speaker card: Ada Lovelace, speaking at CND 2026.',
  subject: { type: 'speaker', id: 'ada', name: 'Ada Lovelace' },
}
const MEME: StudioCard = { tab: 'meme-generator', title: '' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pixels = 'rendered card pixels'
  mocks.rasterize.mockImplementation(async () => ({
    width: 1024,
    height: 1024,
    toBlob: (callback: BlobCallback) =>
      callback(new Blob([mocks.pixels], { type: 'image/png' })),
  }))
  mocks.uploader.mockResolvedValue({ _id: 'asset-1', softOnSocial: true })
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ assetId: 'image-uploaded', taskRev: 'upload-rev' }),
  })
  mocks.mutate.mockResolvedValue({ success: true, handoffFailures: [] })
  mocks.refetch.mockResolvedValue({ data: { task: { _rev: 'rev' } } })
  vi.stubGlobal('fetch', mocks.fetch)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x' }))
  URL.revokeObjectURL = mocks.revoke
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function sized(testId: string) {
  const card = screen.getByTestId(testId).parentElement!
  Object.defineProperties(card, {
    offsetWidth: { value: 256 },
    offsetHeight: { value: 256 },
  })
}

function Card({ card, id }: { card?: StudioCard; id: string }) {
  return (
    <DownloadableImage filename={id} studio={card}>
      <div data-testid={id}>{id}</div>
    </DownloadableImage>
  )
}

function renderStudio(children: ReactNode, taskId?: string) {
  render(
    <StudioGalleryProvider orgId="org-A" uploader={mocks.uploader}>
      <StudioTaskProvider taskId={taskId}>{children}</StudioTaskProvider>
    </StudioGalleryProvider>,
  )
}

async function openDialog(button: HTMLElement) {
  fireEvent.click(button)
  return screen.findByRole('form', { name: 'Save to gallery' })
}

function readText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })
}

describe('Save to gallery on a studio card', () => {
  it('saves a speaker card with its subject, its prefilled alt and its tab, without a Task', async () => {
    renderStudio(<Card card={SPEAKER_CARD} id="ada-card" />)
    sized('ada-card')
    expect(screen.queryByRole('button', { name: 'Attach to Task' })).toBeNull()
    const form = await openDialog(
      screen.getByRole('button', { name: 'Save to gallery' }),
    )
    expect(within(form).getByLabelText('Title')).toHaveProperty(
      'value',
      SPEAKER_CARD.title,
    )
    expect(within(form).getByLabelText('Alt text')).toHaveProperty(
      'value',
      SPEAKER_CARD.alt,
    )
    expect(form.textContent).toContain('Ada Lovelace')
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findByRole('status')

    const [file, details, options] = mocks.uploader.mock.calls[0]
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('ada-card.png')
    expect(file.type).toBe('image/png')
    expect(await readText(file)).toBe('rendered card pixels')
    expect(details).toEqual({
      title: SPEAKER_CARD.title,
      alt: SPEAKER_CARD.alt,
      edition: 'current',
      subject: { type: 'speaker', id: 'ada' },
      tags: [],
    })
    expect(options).toEqual({ kind: 'image', studio: { tab: 'speakers' } })
    // Never the studio's multipart route.
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('in the gallery')
    expect(screen.getByText(/may look soft on social/)).toBeTruthy()
    // The gallery and the background picker show it next time.
    expect(mocks.invalidateList).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateFilters).toHaveBeenCalledTimes(1)
  })

  it('lets a closed capture go once the dialog has faded out', async () => {
    renderStudio(<Card card={SPEAKER_CARD} id="closed" />)
    sized('closed')
    const form = await openDialog(
      screen.getByRole('button', { name: 'Save to gallery' }),
    )
    expect(form.querySelector('img')?.getAttribute('src')).toBe('blob:x')
    expect(mocks.revoke).not.toHaveBeenCalled()
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith('blob:x'))
    await waitFor(() =>
      expect(
        screen.queryByRole('form', { name: 'Save to gallery' }),
      ).toBeNull(),
    )
    expect(mocks.uploader).not.toHaveBeenCalled()
    expect(mocks.invalidateList).not.toHaveBeenCalled()
  })

  it('asks the free-form editor for a title and alt text, and saves it with no subject', async () => {
    renderStudio(<Card card={MEME} id="meme" />)
    sized('meme')
    const form = await openDialog(
      screen.getByRole('button', { name: 'Save to gallery' }),
    )
    const save = within(form).getByRole('button', { name: 'Save' })
    expect(within(form).getByLabelText('Title')).toHaveProperty('value', '')
    expect(within(form).getByLabelText('Alt text')).toHaveProperty('value', '')
    expect(save).toHaveProperty('disabled', true)
    fireEvent.change(within(form).getByLabelText('Title'), {
      target: { value: 'Friday meme' },
    })
    expect(save).toHaveProperty('disabled', true)
    fireEvent.change(within(form).getByLabelText('Alt text'), {
      target: { value: 'A cat deploying on a Friday' },
    })
    expect(save).toHaveProperty('disabled', false)
    fireEvent.click(save)
    await screen.findByRole('status')
    const [, details, options] = mocks.uploader.mock.calls[0]
    expect(details).toMatchObject({
      title: 'Friday meme',
      alt: 'A cat deploying on a Friday',
      subject: null,
    })
    expect(options).toEqual({
      kind: 'image',
      studio: { tab: 'meme-generator' },
    })
  })

  it('saves a capture larger than 4.5 MB whole', async () => {
    mocks.pixels = new Uint8Array(6 * 1024 * 1024)
    renderStudio(<Card card={SPEAKER_CARD} id="big" />)
    sized('big')
    const form = await openDialog(
      screen.getByRole('button', { name: 'Save to gallery' }),
    )
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findByRole('status')
    expect(mocks.uploader.mock.calls[0][0].size).toBe(6 * 1024 * 1024)
  })

  it('shows why a save failed and keeps what was typed', async () => {
    mocks.uploader.mockRejectedValue(
      new Error('The image could not be added. Try again.'),
    )
    renderStudio(<Card card={SPEAKER_CARD} id="fail" />)
    sized('fail')
    const form = await openDialog(
      screen.getByRole('button', { name: 'Save to gallery' }),
    )
    fireEvent.change(within(form).getByLabelText('Title'), {
      target: { value: 'Edited title' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The image could not be added. Try again.',
    )
    expect(within(form).getByLabelText('Title')).toHaveProperty(
      'value',
      'Edited title',
    )
  })

  it('is not offered outside the studio’s gallery provider, or on a card that is no studio card', () => {
    render(<Card card={SPEAKER_CARD} id="elsewhere" />)
    expect(screen.queryByRole('button', { name: 'Save to gallery' })).toBeNull()
    cleanup()
    renderStudio(<Card id="plain" />)
    expect(screen.queryByRole('button', { name: 'Save to gallery' })).toBeNull()
  })
})

describe('with a render Task open', () => {
  it('offers both, and attach to Task still goes through its own route unchanged', async () => {
    renderStudio(<Card card={SPEAKER_CARD} id="task-card" />, 'render-1')
    sized('task-card')
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        taskId: 'render-1',
        taskRev: 'upload-rev',
        assetId: 'image-uploaded',
      }),
    )
    const [url, request] = mocks.fetch.mock.calls[0]
    expect(url).toBe('/api/admin/marketing-studio-image')
    expect(request.body.get('taskId')).toBe('render-1')
    expect(mocks.uploader).not.toHaveBeenCalled()

    const form = await openDialog(
      screen.getByRole('button', { name: 'Save to gallery' }),
    )
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.uploader).toHaveBeenCalledTimes(1))
    expect(mocks.uploader.mock.calls[0][2]).toEqual({
      kind: 'image',
      studio: { tab: 'speakers' },
    })
    // The gallery save sent nothing to the Task's route.
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('the real upload path', () => {
  it('uploads straight to Blob and moves through the gallery route', async () => {
    mocks.blobUpload.mockResolvedValue({
      url: 'https://s.public.blob.vercel-storage.com/marketing-asset/org-A/1-ada-card-x.png',
    })
    mocks.fetch.mockResolvedValue(
      Response.json({ _id: 'asset-9', softOnSocial: false }),
    )
    render(
      <StudioGalleryProvider orgId="org-A">
        <Card card={SPEAKER_CARD} id="ada-card" />
      </StudioGalleryProvider>,
    )
    sized('ada-card')
    const form = await openDialog(
      screen.getByRole('button', { name: 'Save to gallery' }),
    )
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findByRole('status')
    expect(mocks.blobUpload.mock.calls[0][0]).toMatch(
      /^marketing-asset\/org-A\/\d{13}-ada-card\.png$/,
    )
    const [url, init] = mocks.fetch.mock.calls[0]
    expect(url).toBe('/api/admin/marketing-assets')
    expect(JSON.parse(init.body)).toMatchObject({
      kind: 'image',
      studio: { tab: 'speakers' },
      subject: { type: 'speaker', id: 'ada' },
      edition: 'current',
    })
  })
})

describe('Save an exported video to the gallery (#1182)', () => {
  const MP4 = new Blob([new Uint8Array(4096)], { type: 'video/mp4' })
  const POSTER = new Blob(['first frame'], { type: 'image/jpeg' })
  const SAVED: VideoOrigin = { title: 'Launch teaser', projectId: 'vp-1' }

  function Exported({
    origin,
    poster = async () => POSTER,
  }: {
    origin: VideoOrigin
    poster?: ExportedVideo['poster']
  }) {
    const gallery = useGallerySave()!
    return (
      <button
        type="button"
        onClick={() => gallery.saveVideo({ blob: MP4, poster }, origin)}
      >
        Save to gallery
      </button>
    )
  }

  async function openVideoDialog(
    origin: VideoOrigin,
    poster?: () => Promise<Blob>,
  ) {
    render(
      <StudioGalleryProvider orgId="org-A" uploader={mocks.uploader}>
        <Exported origin={origin} poster={poster} />
      </StudioGalleryProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save to gallery' }))
    return screen.findByRole('form', { name: 'Save video to gallery' })
  }

  const describeAlt = (form: HTMLElement) =>
    fireEvent.change(within(form).getByLabelText('Alt text'), {
      target: { value: 'Five scenes counting down to the keynote.' },
    })

  it('keeps the video dialog when an image capture that was still running lands', async () => {
    let finishCapture: (() => void) | null = null
    mocks.rasterize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCapture = () =>
            resolve({
              width: 1024,
              height: 1024,
              toBlob: (callback: BlobCallback) =>
                callback(new Blob(['pixels'], { type: 'image/png' })),
            })
        }),
    )
    render(
      <StudioGalleryProvider orgId="org-A" uploader={mocks.uploader}>
        <StudioTaskProvider>
          <Card card={SPEAKER_CARD} id="ada-card" />
        </StudioTaskProvider>
        <Exported origin={SAVED} />
      </StudioGalleryProvider>,
    )
    sized('ada-card')
    const [imageButton, videoButton] = screen.getAllByRole('button', {
      name: 'Save to gallery',
    })
    fireEvent.click(imageButton)
    await waitFor(() => expect(mocks.rasterize).toHaveBeenCalled())
    fireEvent.click(videoButton)
    const form = await screen.findByRole('form', {
      name: 'Save video to gallery',
    })
    await act(async () => finishCapture!())
    // The newer ask stands: the video dialog is still up, with its title.
    expect(within(form).getByLabelText('Title')).toHaveProperty(
      'value',
      SAVED.title,
    )
    expect(screen.queryByRole('form', { name: 'Save to gallery' })).toBeNull()
  })

  it('saves the MP4 with its poster, subject and the project it came from', async () => {
    mocks.uploader.mockImplementation(async (_f, _d, _o, onProgress) => {
      onProgress?.(0.4)
      return { _id: 'asset-video', softOnSocial: false }
    })
    const form = await openVideoDialog(SAVED)
    expect(within(form).getByLabelText('Title')).toHaveValue('Launch teaser')
    expect(within(form).queryByText(/not saved as a project/)).toBeNull()
    const save = within(form).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    describeAlt(form)
    expect(save).toBeEnabled()

    fireEvent.change(within(form).getByLabelText(/Subject/), {
      target: { value: 'Ada' },
    })
    // Headless UI's Combobox picks on the keyboard in jsdom.
    await screen.findByRole('option', { name: /Ada Lovelace/ })
    const search = within(form).getByLabelText(/Subject/)
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(search).toHaveValue('Ada Lovelace (Speaker)')
    fireEvent.click(save)

    expect(
      await screen.findByText(/is in the gallery/, {}, { timeout: 3000 }),
    ).toHaveTextContent('Launch teaser is in the gallery.')
    expect(mocks.uploader).toHaveBeenCalledTimes(1)
    const [file, details, options, onProgress] = mocks.uploader.mock.calls[0]
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('launch-teaser.mp4')
    expect(file.type).toBe('video/mp4')
    expect(file.size).toBe(4096)
    expect(details).toEqual({
      title: 'Launch teaser',
      alt: 'Five scenes counting down to the keynote.',
      edition: 'current',
      subject: { type: 'speaker', id: 'ada' },
      tags: [],
    })
    expect(options).toEqual({
      kind: 'video',
      poster: POSTER,
      studio: { tab: 'meme-generator', projectId: 'vp-1' },
    })
    expect(options.poster).toBe(POSTER)
    expect(onProgress).toBeTypeOf('function')
    expect(mocks.invalidateList).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateFilters).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('link', { name: 'Open the gallery' }),
    ).toHaveAttribute('href', '/admin/marketing/assets')
  })

  it('says an unsaved video cannot be reopened, and records no project', async () => {
    const form = await openVideoDialog({
      title: 'Untitled video',
      projectId: null,
    })
    expect(
      within(form).getByText(
        'This video is not saved as a project, so the gallery cannot reopen it in the studio. Save the project first if you want that.',
      ),
    ).toBeInTheDocument()
    describeAlt(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findByText(/is in the gallery/)
    const [, details, options] = mocks.uploader.mock.calls[0]
    expect(details.subject).toBeNull()
    expect(options).toEqual({
      kind: 'video',
      poster: POSTER,
      studio: { tab: 'meme-generator' },
    })
  })

  it('shows the upload’s progress, then its refusal, and keeps what was typed', async () => {
    let refuse = () => {}
    mocks.uploader.mockImplementationOnce(async (_f, _d, _o, onProgress) => {
      onProgress?.(0.4)
      await new Promise<void>((resolve) => (refuse = resolve))
      throw new Error('The video is longer than 60 seconds.')
    })
    const form = await openVideoDialog(SAVED)
    describeAlt(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    const bar = await within(form).findByRole('progressbar', {
      name: 'Upload progress',
    })
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    refuse()
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'The video is longer than 60 seconds.',
    )
    expect(within(form).queryByRole('progressbar')).toBeNull()
    expect(within(form).getByLabelText('Alt text')).toHaveValue(
      'Five scenes counting down to the keynote.',
    )
    expect(mocks.invalidateList).not.toHaveBeenCalled()
  })

  it('uploads nothing when the first frame cannot be drawn', async () => {
    const form = await openVideoDialog(SAVED, async () => {
      throw new Error('toBlob gave null')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    describeAlt(form)
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      "The video's first frame could not be drawn. Export again and retry.",
    )
    expect(mocks.uploader).not.toHaveBeenCalled()
  })
})
