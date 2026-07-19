/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { ImageMetadataModal } from '@/components/admin/gallery/ImageMetadataModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      admin: { search: { useQuery: () => ({ data: [] }) } },
    },
    gallery: {
      admin: {
        update: {
          useMutation: () => ({ mutate, mutateAsync: vi.fn() }),
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
    )
    expect(decoySubmit).not.toHaveBeenCalled()
  })
})
