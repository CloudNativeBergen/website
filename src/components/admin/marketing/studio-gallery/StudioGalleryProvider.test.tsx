// @vitest-environment jsdom
/**
 * "Save to gallery" on a studio card (#1164, docs/MARKETING_ASSETS_SPEC.md
 * §4.2), through the REAL DownloadableImage and capture path (html2canvas is
 * the only raster boundary mocked), with and without a render Task open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import type { StudioCard } from '@/components/common/image-capture'
import { StudioTaskProvider } from '../StudioTaskProvider'
import { StudioGalleryProvider } from './StudioGalleryProvider'

const mocks = vi.hoisted(() => ({
  rasterize: vi.fn(),
  uploader: vi.fn(),
  fetch: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  blobUpload: vi.fn(),
  pixels: 'rendered card pixels' as BlobPart,
}))
vi.mock('html2canvas-pro', () => ({ default: mocks.rasterize }))
vi.mock('@vercel/blob/client', () => ({ upload: mocks.blobUpload }))
vi.mock('@/lib/trpc/client', () => ({
  api: {
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
  URL.revokeObjectURL = () => {}
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
