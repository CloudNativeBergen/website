/** @vitest-environment jsdom */
/**
 * Download, Attach to Task and Save to gallery capture the Format the tab is
 * showing, at exactly its pixels (docs/MARKETING_STUDIO_FORMATS_SPEC.md §4),
 * and the saved card names that Format. Mocked at the capture boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DownloadableImage } from './DownloadableImage'
import {
  GallerySaveContext,
  ImageAttachmentContext,
  StudioFormatContext,
  type GallerySave,
  type ImageAttachment,
} from './image-capture'

const mocks = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('./image-capture/capture', () => ({ captureImage: mocks.capture }))

const CARD = {
  tab: 'speakers' as const,
  title: 'Ada – speaker card',
  subject: { type: 'speaker' as const, id: 'ada', name: 'Ada' },
}

const gallery: GallerySave = { busy: false, save: vi.fn(), saveVideo: vi.fn() }
const attachment: ImageAttachment = { busy: false, attach: vi.fn() }

beforeEach(() => {
  mocks.capture.mockReset()
  mocks.capture.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  vi.mocked(gallery.save).mockReset()
  vi.mocked(attachment.attach).mockReset()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x' }))
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderCard(format: 'square' | 'landscape' | 'portrait' | null) {
  render(
    <StudioFormatContext.Provider value={format}>
      <GallerySaveContext.Provider value={gallery}>
        <ImageAttachmentContext.Provider value={attachment}>
          <DownloadableImage filename="ada" studio={CARD}>
            <div data-testid="card">Ada</div>
          </DownloadableImage>
        </ImageAttachmentContext.Provider>
      </GallerySaveContext.Provider>
    </StudioFormatContext.Provider>,
  )
  const element = screen.getByTestId('card').parentElement!
  Object.defineProperties(element, {
    offsetWidth: { value: 256 },
    offsetHeight: { value: 134 },
  })
  return element
}

describe('DownloadableImage on a tab with a Format switch', () => {
  it('downloads at exactly the Format’s pixels, named for the Format', async () => {
    const element = renderCard('landscape')
    const link = document.createElement('a')
    const click = vi.spyOn(link, 'click').mockImplementation(() => {})
    const original = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) =>
      tag === 'a' ? link : original(tag, options),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download as PNG' }))
    await screen.findByText('Download as PNG')
    expect(mocks.capture).toHaveBeenCalledWith(element, {
      label: 'Landscape',
      width: 1200,
      height: 628,
    })
    expect(click).toHaveBeenCalledTimes(1)
    expect(link.download).toMatch(/^ada-landscape-\d+\.png$/)
  })

  it('attaches to the Task at the Format’s pixels', async () => {
    const element = renderCard('portrait')
    fireEvent.click(screen.getByRole('button', { name: 'Attach to Task' }))
    const [capture, filename] = vi.mocked(attachment.attach).mock.calls[0]
    await capture()
    expect(filename).toBe('ada')
    expect(mocks.capture).toHaveBeenCalledWith(element, {
      label: 'Portrait',
      width: 1080,
      height: 1350,
    })
  })

  it('saves to the gallery at the Format’s pixels, with the Format on the card', async () => {
    const element = renderCard('portrait')
    fireEvent.click(screen.getByRole('button', { name: 'Save to gallery' }))
    const [capture, filename, card] = vi.mocked(gallery.save).mock.calls[0]
    expect(filename).toBe('ada')
    expect(card).toEqual({ ...CARD, format: 'portrait' })
    await capture()
    expect(mocks.capture).toHaveBeenCalledWith(element, {
      label: 'Portrait',
      width: 1080,
      height: 1350,
    })
  })
})

describe('DownloadableImage outside any Format switch', () => {
  it('captures as before, 4× the CSS box, and names no Format', async () => {
    const element = renderCard(null)
    fireEvent.click(screen.getByRole('button', { name: 'Save to gallery' }))
    const [capture, , card] = vi.mocked(gallery.save).mock.calls[0]
    expect(card).toEqual(CARD)
    expect(card).not.toHaveProperty('format')
    await capture()
    expect(mocks.capture).toHaveBeenCalledWith(element, undefined)
  })
})
