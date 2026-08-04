/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { createImageUrlBuilder } from '@sanity/image-url'
import { ImageCarousel } from '@/components/ImageCarousel'
import { SimpleImageCarousel } from '@/components/SimpleImageCarousel'
import { GalleryModal } from '@/components/GalleryModal'
import { ImageMosaic } from '@/components/ImageMosaic'
import { galleryImageSrc } from '@/lib/sanity/client'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

// `@/lib/trpc/client` is the tRPC HTTP boundary, not app logic: importing it for
// real builds a React Query client and issues network calls. Every sibling
// component test that renders a tRPC-consuming component stubs it the same way
// (see `__tests__/components/admin/gallery/ImageMetadataModal.test.tsx`), which
// is what "mock at boundaries" (AGENTS.md) asks for. GalleryModal only needs
// `gallery.untagSelf` to exist so the component can mount.
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

function builderCalls(method: 'width' | 'height' | 'quality' | 'fit' | 'auto') {
  const builder = vi.mocked(createImageUrlBuilder).mock.results[0]
    .value as Record<string, ReturnType<typeof vi.fn>>
  return builder[method].mock.calls.map((call) => call[0])
}

/** A 1x1 transparent PNG — an allowed inline raster type. */
const DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * `data:` URIs the gallery must NOT hand to an `<img src>`. The SVG entries are
 * the interesting ones: `<img>` renders SVG in secure static mode so they are
 * not a live script hole, but they are an unsanitized SVG intake behind
 * `sanitizeSvg`'s back, and the repo excludes SVG from stored image assets for
 * the same reason.
 */
const REJECTED_DATA_URIS: ReadonlyArray<[string, string]> = [
  ['HTML', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
  ['unsanitized SVG', 'data:image/svg+xml,<svg onload=alert(1)></svg>'],
  [
    'base64 SVG',
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
  ],
  ['plain text', 'data:text/plain,hello'],
  ['script', 'data:application/javascript,alert(1)'],
  ['a bare data: prefix', 'data:'],
  // `image/pngx` must not slip through on a prefix match — the allowlist is
  // anchored on the media-type/parameter separator.
  ['a look-alike media type', 'data:image/pngx,AAAA'],
]

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

const secondRealImage: GalleryImageWithSpeakers = {
  ...realImage,
  _id: 'image-1b',
  imageAlt: 'A second real photo',
}

const generatedImage: GalleryImageWithSpeakers = {
  ...realImage,
  _id: 'image-2',
  imageUrl: DATA_URI,
  imageAlt: 'Generated artwork',
}

function rejectedImage(imageUrl: string): GalleryImageWithSpeakers {
  return { ...realImage, _id: 'image-3', imageUrl, imageAlt: 'Rejected' }
}

beforeEach(() => {
  const builder = vi.mocked(createImageUrlBuilder).mock.results[0]
    .value as Record<string, ReturnType<typeof vi.fn>>
  for (const method of [
    'image',
    'width',
    'height',
    'quality',
    'fit',
    'auto',
    'url',
  ]) {
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

    it('ImageCarousel keeps its 512x320 thumbnail transform', () => {
      const { container } = render(
        <ImageCarousel images={[realImage, secondRealImage]} />,
      )

      for (const img of container.querySelectorAll('img')) {
        expect(img.getAttribute('src')).toBe(MOCK_CDN_URL)
      }
      // Main image (2400 + 1x/2x srcSet), then one thumbnail per image, each
      // 512x320 with a 256x160 / 512x320 srcSet.
      expect(builderCalls('width')).toEqual([
        2400, 1200, 2400, 512, 256, 512, 512, 256, 512,
      ])
      expect(builderCalls('height')).toEqual([320, 160, 320, 320, 160, 320])
      expect(builderCalls('quality')).toEqual([
        85, 85, 85, 85, 85, 85, 85, 85, 85,
      ])
      expect(builderCalls('fit')).toEqual([
        'max',
        'max',
        'max',
        'crop',
        'crop',
        'crop',
        'crop',
        'crop',
        'crop',
      ])
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

  describe('browser-bound URLs opt into CDN format negotiation', () => {
    it('ImageCarousel asks for auto=format on the src and both srcSet entries', () => {
      render(<ImageCarousel images={[realImage]} />)

      // One per builder URL: src (2400) + srcSet 1x/2x.
      expect(builderCalls('auto')).toEqual(['format', 'format', 'format'])
    })

    it('ImageCarousel asks for auto=format on thumbnails too', () => {
      render(<ImageCarousel images={[realImage, secondRealImage]} />)

      expect(builderCalls('auto')).toEqual(
        builderCalls('width').map(() => 'format'),
      )
    })

    it('GalleryModal asks for auto=format on main image and thumbnail', () => {
      render(<GalleryModal isOpen images={[realImage]} onClose={() => {}} />)

      expect(builderCalls('auto')).toEqual(['format', 'format'])
    })

    it('does not reach the builder at all for inline data: URIs', () => {
      render(<ImageCarousel images={[generatedImage]} />)

      expect(builderCalls('auto')).toEqual([])
    })

    // ImageMosaic (#736) landed after this rule and builds its own 1x/2x
    // srcSet next to a `galleryImageSrc` src, so it needs the same assertion:
    // the helper covers the src, but the srcSet entries are raw builder calls.
    it('ImageMosaic asks for auto=format on the src and both srcSet entries', () => {
      render(<ImageMosaic images={[realImage]} />)

      expect(builderCalls('auto')).toEqual(
        builderCalls('width').map(() => 'format'),
      )
      expect(builderCalls('width')).toEqual([800, 600, 1200])
    })

    it('ImageMosaic does not reach the builder for inline data: URIs', () => {
      render(<ImageMosaic images={[generatedImage]} />)

      expect(builderCalls('auto')).toEqual([])
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

    it('ImageCarousel uses the data URI for the thumbnail too', () => {
      const { container } = render(
        <ImageCarousel images={[generatedImage, realImage]} />,
      )

      const [mainImg, generatedThumb, realThumb] =
        container.querySelectorAll('img')

      expect(mainImg.getAttribute('src')).toBe(DATA_URI)
      expect(generatedThumb.getAttribute('src')).toBe(DATA_URI)
      expect(generatedThumb.hasAttribute('srcset')).toBe(false)
      // The real image alongside it still gets the full builder treatment.
      expect(realThumb.getAttribute('src')).toBe(MOCK_CDN_URL)
      expect(builderCalls('width')).toEqual([512, 256, 512])
      expect(builderCalls('fit')).toEqual(['crop', 'crop', 'crop'])
    })
  })

  describe('a non-image data: URI is refused, not passed through', () => {
    it.each(REJECTED_DATA_URIS)(
      'galleryImageSrc falls back to the builder for %s',
      (_label, uri) => {
        const src = galleryImageSrc(rejectedImage(uri), {
          width: 2400,
          quality: 85,
          fit: 'max',
        })

        expect(src).toBe(MOCK_CDN_URL)
        expect(src).not.toContain('data:')
        expect(builderCalls('width')).toEqual([2400])
      },
    )

    it.each(REJECTED_DATA_URIS)(
      'ImageCarousel renders the CDN src and keeps its srcSet for %s',
      (_label, uri) => {
        const { container } = render(
          <ImageCarousel images={[rejectedImage(uri)]} />,
        )
        const img = container.querySelector('img')!

        // Exactly the pre-fix behaviour: the builder URL, srcSet and all. If
        // the asset is missing the component's existing onError state handles
        // it — which is strictly better than rendering the refused bytes.
        expect(img.getAttribute('src')).toBe(MOCK_CDN_URL)
        expect(img.getAttribute('srcset')).toBe(
          `${MOCK_CDN_URL} 1x, ${MOCK_CDN_URL} 2x`,
        )
        expect(builderCalls('width')).toEqual([2400, 1200, 2400])
      },
    )

    it.each(REJECTED_DATA_URIS)(
      'GalleryModal renders the CDN src for %s',
      (_label, uri) => {
        const { baseElement } = render(
          <GalleryModal
            isOpen
            images={[rejectedImage(uri)]}
            onClose={() => {}}
          />,
        )

        const images = baseElement.querySelectorAll('img')
        expect(images.length).toBeGreaterThan(0)
        for (const img of images) {
          expect(img.getAttribute('src')).toBe(MOCK_CDN_URL)
        }
      },
    )

    it('resolves to no src at all when there is no asset to fall back to', () => {
      // Without `image` there is nothing to build, so the refused bytes must
      // not leak out through the "just return imageUrl" branch.
      expect(
        galleryImageSrc(
          { imageUrl: 'data:text/html,<script>alert(1)</script>' },
          { width: 2400 },
        ),
      ).toBe('')
    })

    it('still passes a plain remote URL through when there is no asset', () => {
      expect(
        galleryImageSrc(
          { imageUrl: 'https://example.test/photo.jpg' },
          { width: 2400 },
        ),
      ).toBe('https://example.test/photo.jpg')
    })
  })
})
