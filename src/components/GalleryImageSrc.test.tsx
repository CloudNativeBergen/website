/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { createImageUrlBuilder } from '@sanity/image-url'
import { ImageCarousel } from '@/components/ImageCarousel'
import { SimpleImageCarousel } from '@/components/SimpleImageCarousel'
import { GalleryModal } from '@/components/GalleryModal'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    gallery: {
      untagSelf: {
        useMutation: () => ({
          mutate: () => {},
          mutateAsync: async () => {},
          reset: () => {},
          isPending: false,
        }),
      },
    },
  },
}))

// The image-url module is aliased to a chainable mock builder in
// vitest.config.ts. client.ts builds one at import time, so every transform in
// the app funnels through this single instance and its calls are inspectable.
const MOCK_CDN_URL = 'https://cdn.sanity.io/images/mock/image.png'

function builderCalls(method: 'width' | 'height' | 'quality' | 'fit') {
  const builder = vi.mocked(createImageUrlBuilder).mock.results[0]
    .value as Record<string, ReturnType<typeof vi.fn>>
  return builder[method].mock.calls.map((call) => call[0])
}

const DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='

const realImage: GalleryImageWithSpeakers = {
  _id: 'image-1',
  _rev: 'rev-1',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-01T00:00:00Z',
  photographer: 'Ada Lovelace',
  date: '2026-01-01',
  location: 'Bergen',
  featured: true,
  image: {
    _type: 'image',
    asset: { _ref: 'image-abc123-1200x800-jpg', _type: 'reference' },
  },
  speakers: [],
  imageUrl: 'https://cdn.sanity.io/images/p/d/abc123-1200x800.jpg',
  imageAlt: 'A real photo',
}

const generatedImage: GalleryImageWithSpeakers = {
  ...realImage,
  _id: 'image-2',
  imageUrl: DATA_URI,
  imageAlt: 'Generated artwork',
}

beforeEach(() => {
  const builder = vi.mocked(createImageUrlBuilder).mock.results[0]
    .value as Record<string, ReturnType<typeof vi.fn>>
  for (const method of ['image', 'width', 'height', 'quality', 'fit', 'url']) {
    builder[method].mockClear()
  }
})

afterEach(cleanup)

describe('gallery image src resolution', () => {
  describe('real Sanity images go through the image builder unchanged', () => {
    it('ImageCarousel keeps its 2400px src and the 1x/2x srcSet', () => {
      const { container } = render(<ImageCarousel images={[realImage]} />)
      const img = container.querySelector('img')!

      expect(img.getAttribute('src')).toBe(MOCK_CDN_URL)
      expect(img.getAttribute('srcset')).toBe(
        `${MOCK_CDN_URL} 1x, ${MOCK_CDN_URL} 2x`,
      )
      // src (2400) + srcSet (1200, 2400); no height, so fit/quality only.
      expect(builderCalls('width')).toEqual([2400, 1200, 2400])
      expect(builderCalls('height')).toEqual([])
      expect(builderCalls('quality')).toEqual([85, 85, 85])
      expect(builderCalls('fit')).toEqual(['max', 'max', 'max'])
    })

    it('SimpleImageCarousel keeps its 1200px transform', () => {
      const { container } = render(
        <SimpleImageCarousel images={[realImage]} onImageClick={() => {}} />,
      )

      expect(container.querySelector('img')!.getAttribute('src')).toBe(
        MOCK_CDN_URL,
      )
      expect(builderCalls('width')).toEqual([1200])
      expect(builderCalls('quality')).toEqual([85])
      expect(builderCalls('fit')).toEqual(['max'])
    })

    it('GalleryModal keeps its main-image and thumbnail transforms', () => {
      const { baseElement } = render(
        <GalleryModal isOpen images={[realImage]} onClose={() => {}} />,
      )

      for (const img of baseElement.querySelectorAll('img')) {
        expect(img.getAttribute('src')).toBe(MOCK_CDN_URL)
      }
      // Main image at 1920/max, thumbnail at 192x128/crop.
      expect(builderCalls('width')).toEqual([1920, 192])
      expect(builderCalls('height')).toEqual([128])
      expect(builderCalls('quality')).toEqual([90, 85])
      expect(builderCalls('fit')).toEqual(['max', 'crop'])
    })
  })

  describe('data: URI artwork bypasses the builder', () => {
    it('ImageCarousel renders the data URI and omits srcSet', () => {
      const { container } = render(<ImageCarousel images={[generatedImage]} />)
      const img = container.querySelector('img')!

      expect(img.getAttribute('src')).toBe(DATA_URI)
      // A data URI has no responsive variants, so there is no srcSet to build.
      expect(img.hasAttribute('srcset')).toBe(false)
      expect(builderCalls('width')).toEqual([])
    })

    it('SimpleImageCarousel renders the data URI', () => {
      const { container } = render(
        <SimpleImageCarousel
          images={[generatedImage]}
          onImageClick={() => {}}
        />,
      )

      expect(container.querySelector('img')!.getAttribute('src')).toBe(DATA_URI)
      expect(builderCalls('width')).toEqual([])
    })

    it('GalleryModal renders the data URI for main image and thumbnail', () => {
      const { baseElement } = render(
        <GalleryModal isOpen images={[generatedImage]} onClose={() => {}} />,
      )

      const images = baseElement.querySelectorAll('img')
      expect(images.length).toBeGreaterThan(0)
      for (const img of images) {
        expect(img.getAttribute('src')).toBe(DATA_URI)
      }
      expect(builderCalls('width')).toEqual([])
    })
  })
})
