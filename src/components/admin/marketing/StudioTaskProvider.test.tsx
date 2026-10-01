// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import { StudioTaskProvider } from './StudioTaskProvider'
import { FormatSwitch } from './studio-cards'

const mocks = vi.hoisted(() => ({
  task: {
    _id: 'render-1',
    _rev: 'old-rev',
    title: 'Save the date',
    kind: 'studioRender',
    subject: null,
  },
  mutate: vi.fn(),
  refetch: vi.fn(),
  rasterize: vi.fn(),
  upload: vi.fn(),
  galleryList: vi.fn(),
  galleryFilters: vi.fn(),
}))
vi.mock('html2canvas-pro', () => ({ default: mocks.rasterize }))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      marketingAsset: {
        list: { invalidate: mocks.galleryList },
        filters: { invalidate: mocks.galleryFilters },
      },
    }),
    marketing: {
      task: {
        get: {
          useQuery: () => ({
            data: { task: mocks.task },
            refetch: mocks.refetch,
          }),
        },
        attachAsset: { useMutation: () => ({ mutateAsync: mocks.mutate }) },
      },
    },
  },
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.task.kind = 'studioRender'
  mocks.rasterize.mockImplementation(async () => ({
    width: 1200,
    height: 800,
    toBlob: (callback: BlobCallback) =>
      callback(new Blob(['rendered conference pixels'], { type: 'image/png' })),
  }))
  mocks.upload.mockResolvedValue({
    ok: true,
    json: async () => ({ assetId: 'image-uploaded', taskRev: 'upload-rev' }),
  })
  mocks.mutate.mockResolvedValue({
    success: true,
    handoffFailures: [],
    gallerySaved: true,
  })
  mocks.refetch.mockResolvedValue({
    data: { task: { ...mocks.task, _rev: 'current-rev' } },
  })
  vi.stubGlobal('fetch', mocks.upload)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function setup() {
  render(
    <StudioTaskProvider taskId="render-1">
      <DownloadableImage filename="conference">
        <div data-testid="conference-card">Conference render</div>
      </DownloadableImage>
    </StudioTaskProvider>,
  )
  const card = screen.getByTestId('conference-card').parentElement!
  Object.defineProperties(card, {
    offsetWidth: { value: 300 },
    offsetHeight: { value: 200 },
  })
  const image = document.createElement('img')
  image.src = 'https://images.example.org/conference.png'
  Object.defineProperties(image, {
    complete: { value: true },
    naturalWidth: { value: 300 },
  })
  card.append(image)
  return { card, image }
}
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}
describe('Studio Task attachment', () => {
  it('attaches a subjectless render with its Task-bound upload asset and revision', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        taskId: 'render-1',
        taskRev: 'upload-rev',
        assetId: 'image-uploaded',
      }),
    )
    const [url, request] = mocks.upload.mock.calls[0]
    expect(url).toBe('/api/admin/marketing-studio-image')
    expect(request.body.get('taskId')).toBe('render-1')
    expect(request.body.get('file').type).toBe('image/png')
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image attached and saved to the asset gallery. This Task is complete.',
    )
    // The gallery's lists show it now, not after their cache goes stale.
    expect(mocks.galleryList).toHaveBeenCalled()
    expect(mocks.galleryFilters).toHaveBeenCalled()
  })
  it('uploads the real attach control raster with proxy rewriting and capture cleanup', async () => {
    const { card, image } = setup()
    const original = image.src
    const output = {
      width: 1200,
      height: 800,
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(
          new Blob(['rendered conference pixels'], { type: 'image/png' }),
        ),
      ),
    }
    const captureSources: string[] = []
    mocks.rasterize.mockImplementation(async () => {
      captureSources.push(image.getAttribute('src')!)
      return output
    })
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    await screen.findByRole('status')
    const file = mocks.upload.mock.calls[0][1].body.get('file') as File
    expect(await blobText(file)).toBe('rendered conference pixels')
    expect(file.name).toBe('conference.png')
    expect(captureSources).toEqual([
      `/api/proxy-image?url=${encodeURIComponent(original)}`,
    ])
    expect(mocks.rasterize).toHaveBeenCalledWith(
      card,
      expect.objectContaining({
        scale: 4,
        useCORS: true,
        allowTaint: false,
        width: 300,
        height: 200,
      }),
    )
    expect(output.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/png',
      1,
    )
    expect(image.src).toBe(original)
    expect([output.width, output.height]).toEqual([0, 0])
  })
  it('shows the placeholder reason after saving and keeps the saved render retryable', async () => {
    mocks.mutate.mockResolvedValueOnce({
      success: true,
      handoffFailures: ['post-1'],
      handoffIssues: ['Fill in {tier} in the alt text before scheduling.'],
    })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Fill in {tier} in the alt text before scheduling.',
      ),
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'Retry attachment / handoff',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('retries a failed handoff using the saved render without recapture or another upload', async () => {
    mocks.mutate
      .mockResolvedValueOnce({
        success: true,
        handoffFailures: ['post-1'],
        gallerySaved: true,
      })
      // A handoff-only retry leaves the gallery alone, and says so.
      .mockResolvedValueOnce({ success: true, handoffFailures: [] })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    const retry = await screen.findByRole('button', {
      name: 'Retry attachment / handoff',
    })
    expect(screen.getByRole('alert').textContent).toBe(
      'The render is done and saved. The image has not reached all publishing Tasks yet. Prerequisites are advisory, so they can publish without it. Retry here or from the Task editor.',
    )
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(retry)
    // The retry did not save to the gallery, so it does not claim it did.
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image attached. This Task is complete.',
    )
    expect(mocks.mutate.mock.calls).toEqual([
      [
        {
          taskId: 'render-1',
          taskRev: 'upload-rev',
          assetId: 'image-uploaded',
        },
      ],
      [
        {
          taskId: 'render-1',
          taskRev: 'current-rev',
          assetId: 'image-uploaded',
        },
      ],
    ])
    expect(mocks.rasterize).toHaveBeenCalledTimes(1)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
  it('re-reads the current revision after a conflict and successfully retries with r3', async () => {
    mocks.upload.mockResolvedValue({
      ok: true,
      json: async () => ({ assetId: 'image-uploaded', taskRev: 'r2' }),
    })
    mocks.refetch.mockResolvedValue({
      data: { task: { ...mocks.task, _rev: 'r3' } },
    })
    mocks.mutate.mockImplementation(async (input) => {
      if (input.taskRev !== 'r3') throw new Error('Revision conflict')
      return { success: true, handoffFailures: [], gallerySaved: true }
    })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Revision conflict',
    )
    const retry = screen.getByRole('button', {
      name: 'Retry attachment / handoff',
    })
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(retry)
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenNthCalledWith(2, {
        taskId: 'render-1',
        taskRev: 'r3',
        assetId: 'image-uploaded',
      }),
    )
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image attached and saved to the asset gallery. This Task is complete.',
    )
    expect(mocks.rasterize).toHaveBeenCalledTimes(1)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
  it('offers a retry when only the gallery save failed, and the retry completes it (#1165)', async () => {
    mocks.mutate
      .mockResolvedValueOnce({
        success: true,
        handoffFailures: [],
        galleryFailed: true,
      })
      .mockResolvedValueOnce({
        success: true,
        handoffFailures: [],
        gallerySaved: true,
      })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The render is done and saved. It has not been saved to the asset gallery yet. Retry here or from the Task editor.',
    )
    // A failed save may still have changed the gallery (the entry landed,
    // a later step failed): its lists are refreshed on every answer.
    expect(mocks.galleryList).toHaveBeenCalled()
    expect(mocks.galleryFilters).toHaveBeenCalled()
    const retry = screen.getByRole('button', {
      name: 'Retry attachment / handoff',
    })
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(retry)
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenNthCalledWith(2, {
        taskId: 'render-1',
        taskRev: 'current-rev',
        assetId: 'image-uploaded',
      }),
    )
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image attached and saved to the asset gallery. This Task is complete.',
    )
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
  it('refuses a capture the multipart route could not carry, naming the gallery path (#1247)', async () => {
    mocks.rasterize.mockImplementation(async () => ({
      width: 1080,
      height: 1350,
      toBlob: (callback: BlobCallback) =>
        callback(
          new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], {
            type: 'image/png',
          }),
        ),
    }))
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('4.0 MB')
    expect(alert.textContent).toContain('Save it to the gallery')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('does not offer attachment for a non-render Task', () => {
    mocks.task.kind = 'checklist'
    setup()
    expect(screen.queryByRole('button', { name: 'Attach to Task' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Download as PNG' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(
      'This Task does not use the promo studio.',
    )
  })
  it('surfaces upload refusal without presenting completion', async () => {
    mocks.upload.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Task not found' }),
    })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    await waitFor(() =>
      expect(
        screen.getByText('Render for Task: Save the date').parentElement
          ?.textContent,
      ).toContain('Task not found'),
    )
    expect(mocks.mutate).toHaveBeenCalledTimes(0)
  })
})

describe('the Format of the render Task (Formats spec §4)', () => {
  /** A speaker card on a tab with a Format switch, opened from the Task. */
  function setupCard(defaultFormat: 'square' | 'landscape') {
    render(
      <StudioTaskProvider taskId="render-1">
        <FormatSwitch defaultFormat={defaultFormat}>
          <DownloadableImage
            filename="speaker"
            studio={{ tab: 'speakers', title: 'Ada' }}
          >
            <div data-testid="speaker-card">Speaker card</div>
          </DownloadableImage>
        </FormatSwitch>
      </StudioTaskProvider>,
    )
    const card = screen.getByTestId('speaker-card').parentElement!
    Object.defineProperties(card, {
      offsetWidth: { value: 256 },
      offsetHeight: { value: 134 },
    })
  }
  /** jsdom has no 2D context: record the size of the canvas the PNG is of. */
  function canvasSizes() {
    const sizes: number[][] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      function (this: HTMLCanvasElement, callback) {
        sizes.push([this.width, this.height])
        callback(new Blob(['card pixels'], { type: 'image/png' }))
      },
    )
    return sizes
  }
  beforeEach(() => {
    Object.assign(mocks.task, { format: 'landscape' })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.assign(mocks.task, { format: undefined })
  })

  it('says which Format the Task asks for', () => {
    setupCard('landscape')
    expect(screen.getByText(/This Task asks for/).textContent).toBe(
      'This Task asks for Landscape (1200×628). Choose a render below and attach it to this Task.',
    )
  })

  it('attaches the Format the Task asks for, at exactly its pixels, and names the card it came from', async () => {
    const sizes = canvasSizes()
    setupCard('landscape')
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        taskId: 'render-1',
        taskRev: 'upload-rev',
        assetId: 'image-uploaded',
        studio: { tab: 'speakers', format: 'landscape' },
      }),
    )
    expect(sizes).toEqual([[1200, 628]])
    const request = mocks.upload.mock.calls[0][1]
    expect(request.body.get('format')).toBe('landscape')
    expect(request.body.get('file').name).toBe('speaker-landscape.png')
  })

  it('refuses a card switched to another Format, before it is captured or sent', async () => {
    const sizes = canvasSizes()
    setupCard('landscape')
    fireEvent.click(screen.getByRole('radio', { name: /Square/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This Task asks for Landscape (1200×628), and the studio is showing Square (1080×1080). Switch the studio to Landscape, or change the Format on the Task.',
    )
    expect(sizes).toEqual([])
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
})
