/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  render,
  fireEvent,
  cleanup,
  screen,
  waitFor,
} from '@testing-library/react'
import { ImageMetadataModal } from '@/components/admin/gallery/ImageMetadataModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

const { mutate, mutateAsync } = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      admin: { search: { useQuery: () => ({ data: [] }) } },
    },
    gallery: {
      admin: {
        update: {
          useMutation: () => ({ mutate, mutateAsync }),
        },
      },
    },
  },
}))

const singleImage = {
  _id: 'img-1',
  photographer: 'Olav',
  date: '2025-06-12T14:30:00Z',
  location: 'Bergen',
  imageAlt: 'Keynote',
  featured: false,
  speakers: [],
} as unknown as GalleryImageWithSpeakers

afterEach(() => {
  cleanup()
  mutate.mockReset()
  mutateAsync.mockReset()
})

describe('ImageMetadataModal ⌘S (C2)', () => {
  it('submits THIS modal form, not the first form on the page', () => {
    const decoySubmit = vi.fn((e: React.FormEvent) => e.preventDefault())

    render(
      <>
        {/* A decoy form that appears FIRST in document order. The old
            document.querySelector('form') would have submitted this one. */}
        <form data-testid="decoy" onSubmit={decoySubmit}>
          <button type="submit">decoy</button>
        </form>
        <NotificationProvider>
          <ImageMetadataModal
            image={singleImage}
            isOpen
            onClose={vi.fn()}
            onUpdate={vi.fn()}
          />
        </NotificationProvider>
      </>,
    )

    fireEvent.keyDown(window, { key: 's', metaKey: true })

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'img-1' }),
      expect.anything(),
    )
    expect(decoySubmit).not.toHaveBeenCalled()
  })
})

describe('ImageMetadataModal bulk update', () => {
  it('notifies once, after every image has settled', async () => {
    let finish: (v: unknown) => void = () => {}
    mutateAsync
      .mockResolvedValueOnce({})
      .mockReturnValueOnce(new Promise((r) => (finish = r)))
    const onUpdate = vi.fn()
    const images = [
      { ...singleImage, _id: 'a' },
      { ...singleImage, _id: 'b' },
    ] as GalleryImageWithSpeakers[]

    const { container } = render(
      <NotificationProvider>
        <ImageMetadataModal
          images={images}
          isOpen
          onClose={vi.fn()}
          onUpdate={onUpdate}
        />
      </NotificationProvider>,
    )
    fireEvent.submit(container.ownerDocument.querySelector('form')!)

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.queryByText(/Successfully updated/)).toBeNull()

    finish({})
    expect(
      await screen.findAllByText('Successfully updated 2 images'),
    ).toHaveLength(1)
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
