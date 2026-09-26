/**
 * @vitest-environment jsdom
 *
 * Gallery images as scene backgrounds (#1180): picked from the organization's
 * gallery, or an upload kept in it. The gallery is injected, so this pins what
 * the editor does with it; the server's side (the id proven ours, the
 * same-origin proxy URL) is marketingAsset.test's, and the real canvas the
 * story's.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  onTestFinished,
} from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { MemeAssets, MemeDesign } from './meme-generator-draw'
import type { BackgroundGallery } from './meme-generator-gallery'

const drawDesign =
  vi.fn<
    (ctx: unknown, design: MemeDesign, assets: MemeAssets, time: number) => void
  >()
vi.mock('./meme-generator-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-draw')>()),
  drawDesign: (...args: [unknown, MemeDesign, MemeAssets, number]) =>
    drawDesign(...args),
}))

import { MemeGenerator } from './MemeGenerator'

const HALL = {
  _id: 'asset-hall',
  title: 'Keynote hall',
  alt: 'The main hall from the stage',
  thumbnailUrl: 'https://cdn.sanity.io/images/p/d/hall.jpg?w=240',
}
const HALL_URL = '/api/proxy-image?url=hall'

function fakeGallery(overrides: Partial<BackgroundGallery> = {}) {
  return {
    images: vi.fn(async () => [HALL]),
    resolve: vi.fn(async (id: string) => ({
      _id: id,
      title: HALL.title,
      url: HALL_URL,
    })),
    keep: vi.fn(async () => ({ _id: 'asset-kept' })),
    ...overrides,
  } satisfies BackgroundGallery
}

beforeEach(() => {
  drawDesign.mockReset()
  // A context the draw can be "given"; the draw itself is mocked.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as unknown as CanvasRenderingContext2D,
  )
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => Promise.resolve(),
  })
  onTestFinished(() => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const lastDrawn = () => {
  const [, design, assets] = drawDesign.mock.lastCall!
  return { image: design.background.image, raster: assets.background }
}
const upload = (name = 'photo.png') =>
  fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
    target: { files: [new File(['x'], name, { type: 'image/png' })] },
  })

describe('a gallery image as the background', () => {
  it('is picked by id and drawn from the URL the gallery resolves', async () => {
    const gallery = fakeGallery()
    render(<MemeGenerator gallery={gallery} />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose from gallery' }))
    fireEvent.click(await screen.findByRole('button', { name: /Keynote hall/ }))

    await screen.findByText('Current: Keynote hall')
    expect(gallery.resolve).toHaveBeenCalledWith('asset-hall')
    await waitFor(() => {
      expect(lastDrawn().image).toEqual({
        url: HALL_URL,
        name: 'Keynote hall',
        galleryAssetId: 'asset-hall',
      })
      expect(lastDrawn().raster).not.toBeNull()
    })
    // Already in the gallery: nothing to keep.
    expect(
      screen.queryByRole('button', { name: 'Keep in gallery' }),
    ).not.toBeInTheDocument()
  })

  it('says so when the image cannot be had, and leaves the background as it was', async () => {
    const gallery = fakeGallery({
      resolve: vi.fn(async () => {
        throw new Error('No marketingAsset with that id for this request')
      }),
    })
    render(<MemeGenerator gallery={gallery} />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose from gallery' }))
    fireEvent.click(await screen.findByRole('button', { name: /Keynote hall/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That image could not be loaded',
    )
    expect(screen.queryByText(/^Current:/)).not.toBeInTheDocument()
  })
})

describe('a slow gallery pick that fails', () => {
  const slowFailingPick = () => {
    let fail: (error: Error) => void = () => {}
    const gallery = fakeGallery({
      resolve: vi.fn(
        () =>
          new Promise<never>((_, reject) => {
            fail = reject
          }),
      ),
    })
    return { gallery, fail: () => fail(new Error('gone')) }
  }
  const pickHall = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Choose from gallery' }))
    fireEvent.click(await screen.findByRole('button', { name: /Keynote hall/ }))
  }

  it('says nothing once a newer background has taken its place', async () => {
    const { gallery, fail } = slowFailingPick()
    render(<MemeGenerator gallery={gallery} />)
    await pickHall()
    await waitFor(() => expect(gallery.resolve).toHaveBeenCalled())
    upload()
    await screen.findByText('Current: photo.png')
    await act(async () => fail())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Current: photo.png')).toBeInTheDocument()
  })

  it('says nothing on the scene the editor has moved on to', async () => {
    const { gallery, fail } = slowFailingPick()
    render(<MemeGenerator gallery={gallery} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await pickHall()
    await waitFor(() => expect(gallery.resolve).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    await act(async () => fail())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('an uploaded background', () => {
  it('works without being kept, and is not kept unless asked', async () => {
    const gallery = fakeGallery()
    render(<MemeGenerator gallery={gallery} />)
    upload()
    await screen.findByText('Current: photo.png')
    await waitFor(() => {
      expect(lastDrawn().image).toMatchObject({ name: 'photo.png' })
      expect(lastDrawn().raster).not.toBeNull()
    })
    expect(lastDrawn().image?.galleryAssetId).toBeUndefined()
    expect(gallery.keep).not.toHaveBeenCalled()
  })

  it('is not offered for keeping when the gallery would refuse the file, and still works', async () => {
    const gallery = fakeGallery()
    render(<MemeGenerator gallery={gallery} />)
    fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
      target: { files: [new File(['x'], 'loop.gif', { type: 'image/gif' })] },
    })
    await screen.findByText('Current: loop.gif')
    await waitFor(() => expect(lastDrawn().raster).not.toBeNull())
    expect(
      screen.queryByRole('button', { name: 'Keep in gallery' }),
    ).not.toBeInTheDocument()
  })

  it('is not offered for keeping when it is over the gallery’s size limit', async () => {
    render(<MemeGenerator gallery={fakeGallery()} />)
    const big = new File(['x'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 })
    fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
      target: { files: [big] },
    })
    await screen.findByText('Current: huge.png')
    expect(
      screen.queryByRole('button', { name: 'Keep in gallery' }),
    ).not.toBeInTheDocument()
  })

  it('works with no gallery at all, which offers neither picking nor keeping', async () => {
    render(<MemeGenerator />)
    upload()
    await screen.findByText('Current: photo.png')
    expect(
      screen.queryByRole('button', { name: 'Choose from gallery' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Keep in gallery' }),
    ).not.toBeInTheDocument()
  })

  it('is kept in the gallery with a title and the alt text it requires', async () => {
    const keep = vi.fn<BackgroundGallery['keep']>(async () => ({
      _id: 'asset-kept',
    }))
    render(<MemeGenerator gallery={fakeGallery({ keep })} />)
    upload('stage-photo.png')
    await screen.findByText('Current: stage-photo.png')

    fireEvent.click(screen.getByRole('button', { name: 'Keep in gallery' }))
    const title = screen.getByLabelText('Title') as HTMLInputElement
    expect(title.value).toBe('stage-photo')
    const save = screen.getByRole('button', { name: 'Save to gallery' })
    // No alt text, no save.
    expect(save).toBeDisabled()
    fireEvent.change(title, { target: { value: 'The stage' } })
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'An empty stage before the keynote' },
    })
    fireEvent.click(save)

    await screen.findByText('In the gallery.')
    expect(keep).toHaveBeenCalledTimes(1)
    const [file, details] = keep.mock.calls[0]
    expect(file.name).toBe('stage-photo.png')
    expect(details).toEqual({
      title: 'The stage',
      alt: 'An empty stage before the keynote',
    })
    await waitFor(() =>
      expect(lastDrawn().image?.galleryAssetId).toBe('asset-kept'),
    )
    expect(
      screen.queryByRole('button', { name: 'Keep in gallery' }),
    ).not.toBeInTheDocument()
  })

  it('shows the gallery’s refusal and stays unkept', async () => {
    const gallery = fakeGallery({
      keep: vi.fn(async () => {
        throw new Error('Use a PNG, JPEG or WebP image.')
      }),
    })
    render(<MemeGenerator gallery={gallery} />)
    upload()
    await screen.findByText('Current: photo.png')
    fireEvent.click(screen.getByRole('button', { name: 'Keep in gallery' }))
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'A photo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save to gallery' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use a PNG, JPEG or WebP image.',
    )
    expect(lastDrawn().image?.galleryAssetId).toBeUndefined()
  })
})

describe('keeping, by keyboard', () => {
  it('moves focus into the form, back on Cancel, and to the announced result on save', async () => {
    render(<MemeGenerator gallery={fakeGallery()} />)
    upload('stage-photo.png')
    await screen.findByText('Current: stage-photo.png')

    fireEvent.click(screen.getByRole('button', { name: 'Keep in gallery' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Keep in gallery' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Keep in gallery' }))
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'An empty stage' },
    })
    // Where focus is the moment the result lands — not a frame later, when a
    // slow machine may already be reading the page.
    const region = screen.getByTestId('background-gallery-status')
    let focusedOnArrival: Element | null = null
    const observer = new MutationObserver(() => {
      if (region.textContent === 'In the gallery.' && !focusedOnArrival)
        focusedOnArrival = document.activeElement
    })
    observer.observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    // Enter in a field submits the form.
    fireEvent.submit(
      screen.getByRole('form', { name: 'Keep the background in the gallery' }),
    )
    const status = screen.getByTestId('background-gallery-status')
    await waitFor(() => expect(status).toHaveTextContent('In the gallery.'))
    observer.disconnect()
    expect(focusedOnArrival).toBe(status)
    expect(document.activeElement).toBe(status)
  })

  it('announces the result in a region that was there before it', async () => {
    render(<MemeGenerator gallery={fakeGallery()} />)
    upload('stage-photo.png')
    await screen.findByText('Current: stage-photo.png')
    const region = screen.getByTestId('background-gallery-status')
    expect(region).toHaveAttribute('role', 'status')
    expect(region).toHaveTextContent('')
    fireEvent.click(screen.getByRole('button', { name: 'Keep in gallery' }))
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'An empty stage' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save to gallery' }))
    await waitFor(() => expect(region).toHaveTextContent('In the gallery.'))
    // The same element: a live region announces changes, not arrivals.
    expect(screen.getByTestId('background-gallery-status')).toBe(region)
  })
})

describe('a keep that lands after the editor has moved on', () => {
  it('leaves focus where the organizer put it', async () => {
    let land: (kept: { _id: string }) => void = () => {}
    const keep = vi.fn<BackgroundGallery['keep']>(
      () => new Promise((resolve) => (land = resolve)),
    )
    render(<MemeGenerator gallery={fakeGallery({ keep })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    upload('one.png')
    await screen.findByText('Current: one.png')
    fireEvent.click(screen.getByRole('button', { name: 'Keep in gallery' }))
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'Scene one' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save to gallery' }))
    await waitFor(() => expect(keep).toHaveBeenCalled())

    // On to scene 2, with a background of its own, and into its headline.
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    upload('two.png')
    await screen.findByText('Current: two.png')
    const headline = screen.getAllByPlaceholderText('Enter your text...')[0]
    headline.focus()

    await act(async () => land({ _id: 'asset-one' }))
    expect(document.activeElement).toBe(headline)
  })
})

describe('clearing the background', () => {
  it('takes a failed pick’s message away with it', async () => {
    const gallery = fakeGallery({
      resolve: vi.fn(async () => {
        throw new Error('gone')
      }),
    })
    render(<MemeGenerator gallery={gallery} />)
    upload()
    await screen.findByText('Current: photo.png')
    fireEvent.click(screen.getByRole('button', { name: 'Choose from gallery' }))
    fireEvent.click(await screen.findByRole('button', { name: /Keynote hall/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That image could not be loaded',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear background image' }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
