/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// The lightbox is a session-aware client component (self-untag needs the
// viewer); it is covered by its own tests. Here it stands in as a marker that
// surfaces the props the band hands it, which is the whole contract under test.
vi.mock('@/components/GalleryModal', () => ({
  GalleryModal: ({
    isOpen,
    images,
    initialIndex,
  }: {
    isOpen: boolean
    images: { _id: string }[]
    initialIndex: number
  }) => (
    <div
      data-testid="gallery-modal"
      data-open={String(isOpen)}
      data-images={images.map((i) => i._id).join(',')}
      data-initial-index={initialIndex}
    />
  ),
}))

import { ImageGallery } from './ImageGallery'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

afterEach(cleanup)

function makeImage(id: string, alt: string): GalleryImageWithSpeakers {
  return {
    _id: id,
    _rev: 'r1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    photographer: 'Olav Nordmann',
    date: '2026-01-01',
    location: 'Grieghallen, Bergen',
    featured: true,
    imageAlt: alt,
    image: {
      _type: 'image',
      asset: { _ref: `image-${id}-1920x1080-jpg`, _type: 'reference' },
    },
    speakers: [],
  } as unknown as GalleryImageWithSpeakers
}

const featured = [
  makeImage('gal1', 'Keynote on the main stage'),
  makeImage('gal2', 'Hands-on workshop'),
  makeImage('gal3', 'Hallway track'),
]

/**
 * BACK-COMPAT TRIPWIRE. Generated from the pre-variant component: the DEFAULT
 * (`carousel`) rendering is what the three live conference sites get, and it
 * must not move. A diff here means the default path regressed — fix the code,
 * never `-u`.
 */
describe('ImageGallery — default (carousel) markup is frozen', () => {
  it('renders the auto-playing carousel band with house copy', () => {
    const { container } = render(<ImageGallery featuredImages={featured} />)
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders tenant copy overrides', () => {
    const { container } = render(
      <ImageGallery
        featuredImages={featured}
        heading="Photos from last year"
        description="A look back at the 2025 edition."
      />,
    )
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the fullscreen affordance when a full gallery exists', () => {
    const { container } = render(
      <ImageGallery
        featuredImages={featured}
        allImages={[...featured, makeImage('gal4', 'After party')]}
      />,
    )
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders nothing without images', () => {
    const { container } = render(<ImageGallery />)
    expect(container.innerHTML).toBe('')
  })
})
