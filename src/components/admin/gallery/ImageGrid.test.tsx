/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { ImageGrid } from './ImageGrid'

const image = {
  _id: 'img-1',
  _rev: 'rev-1',
  _createdAt: '2025-10-28T14:30:00Z',
  _updatedAt: '2025-10-28T14:30:00Z',
  photographer: 'Olav Nordmann',
  date: '2025-10-28T14:30:00Z',
  location: 'Grieghallen, Bergen',
  featured: false,
  image: {
    _type: 'image',
    asset: { _ref: 'image-a-10x10-jpg', _type: 'reference' },
  },
  imageAlt: 'Picture img-1',
  speakers: [],
} as unknown as GalleryImageWithSpeakers

describe('ImageGrid', () => {
  it('shows the photo date in Oslo time, not the raw ISO string', () => {
    const { container } = render(
      <ImageGrid
        images={[image]}
        onImageUpdate={vi.fn()}
        onImageDelete={vi.fn()}
        onToggleFeatured={vi.fn()}
        selectedImages={[]}
        onSelectionChange={vi.fn()}
      />,
    )
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/)
    expect(container.textContent).toContain('15:30')
  })
})
