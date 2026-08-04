/**
 * @vitest-environment jsdom
 *
 * Contract test for the ONLY react-dropzone call site in the app. A green
 * `tsc` says nothing about drop behaviour, and react-dropzone's majors have
 * repeatedly moved runtime semantics (v18 swapped in file-selector v4, which
 * un-bundled the extension->MIME table; v19 changed how over-limit batches are
 * handled). These assertions pin the four things ImageUploadZone actually
 * relies on: `accept` (MIME + extension), `maxSize`, the `FileRejection`
 * shape fed to `onDrop`, and the accepted-file path reaching the preview grid.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react'
import { ImageUploadZone } from '@/components/admin/gallery/ImageUploadZone'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { GALLERY_CONSTANTS } from '@/lib/gallery/constants'

// These stubs mutate jsdom globals, so the originals are captured and restored
// in afterAll rather than left behind for whatever runs next in this worker.
const realCreateObjectURL = URL.createObjectURL
const realRevokeObjectURL = URL.revokeObjectURL
const realSrcDescriptor = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  'src',
)

beforeAll(() => {
  // jsdom has no object URLs and never fires <img> load events. The component
  // only needs `img.onload` to fire; jsdom reports width/height as 0, which is
  // under RESIZE_MAX_*, so resizeImage short-circuits and returns the original
  // File without touching canvas.
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    set() {
      queueMicrotask(() => this.onload?.(new Event('load')))
    },
    get() {
      return 'blob:mock'
    },
  })
})

afterAll(() => {
  URL.createObjectURL = realCreateObjectURL
  URL.revokeObjectURL = realRevokeObjectURL
  if (realSrcDescriptor) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', realSrcDescriptor)
  } else {
    delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).src
  }
})

afterEach(cleanup)

/** A File big enough to trip `maxSize` without allocating 10MB of memory. */
function oversizedFile(name: string, type: string) {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', {
    value: GALLERY_CONSTANTS.UPLOAD.MAX_FILE_SIZE_BYTES + 1,
  })
  return file
}

function renderZone() {
  return render(
    <NotificationProvider>
      <ImageUploadZone onUploadComplete={vi.fn()} />
    </NotificationProvider>,
  )
}

/**
 * react-dropzone reads a drop through file-selector's `fromEvent`, which walks
 * `dataTransfer.items` (NOT `.files`) for 'drop' events, so the fake transfer
 * has to expose DataTransferItem-shaped entries.
 */
function drop(container: HTMLElement, files: File[]) {
  const zone = container.querySelector<HTMLInputElement>(
    'input[aria-label="Upload images"]',
  )!.parentElement!
  fireEvent.drop(zone, {
    dataTransfer: {
      files,
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      types: ['Files'],
    },
  })
}

describe('ImageUploadZone (react-dropzone integration)', () => {
  it('renders the drop target wired by getRootProps/getInputProps', () => {
    const { container } = renderZone()
    const input = container.querySelector('input[aria-label="Upload images"]')
    expect(input).not.toBeNull()
    expect(input).toHaveAttribute('type', 'file')
    // `accept` must still be derived from the Accept object we pass in.
    expect(input?.getAttribute('accept')).toContain('image/jpeg')
    expect(input?.getAttribute('accept')).toContain('.webp')
    expect(
      screen.getByText(/Drag and drop images here, or click to select/),
    ).toBeInTheDocument()
  })

  it('accepts a permitted image and shows it in the preview grid', async () => {
    const { container } = renderZone()
    drop(container, [new File(['abc'], 'keynote.jpg', { type: 'image/jpeg' })])

    expect(await screen.findByText('keynote.jpg')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Upload 1 Image/ }),
    ).toBeInTheDocument()
  })

  it('rejects a non-image with the file-invalid-type error code', async () => {
    const { container } = renderZone()
    drop(container, [new File(['abc'], 'notes.txt', { type: 'text/plain' })])

    expect(await screen.findByText('Rejected: notes.txt')).toBeInTheDocument()
    expect(
      screen.getByText('Invalid file type (only images allowed)'),
    ).toBeInTheDocument()
  })

  it('rejects an oversized image with the file-too-large error code', async () => {
    const { container } = renderZone()
    drop(container, [oversizedFile('huge.png', 'image/png')])

    expect(await screen.findByText('Rejected: huge.png')).toBeInTheDocument()
    expect(
      screen.getByText(
        `File too large (max ${GALLERY_CONSTANTS.UPLOAD.MAX_FILE_SIZE_MB}MB)`,
      ),
    ).toBeInTheDocument()
  })

  it('splits a mixed batch: keeps the valid file, reports only the bad one', async () => {
    const { container } = renderZone()
    drop(container, [
      new File(['abc'], 'ok.png', { type: 'image/png' }),
      new File(['abc'], 'bad.pdf', { type: 'application/pdf' }),
    ])

    expect(await screen.findByText('ok.png')).toBeInTheDocument()
    expect(await screen.findByText('Rejected: bad.pdf')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('Rejected: ok.png')).toBeNull(),
    )
  })
})
