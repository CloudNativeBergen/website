import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { fn } from 'storybook/test'
import { GalleryModal } from './GalleryModal'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

// Renders the REAL GalleryModal (previously this story was a static visual
// mock, so captures never exercised the actual component). The global
// Session/TRPC decorators provide the providers it needs; MSW serves
// placeholder images for the Sanity CDN URLs the image builder produces and
// answers the `gallery.untagSelf` tRPC mutation.

function mockImage(
  id: string,
  overrides: Partial<GalleryImageWithSpeakers>,
): GalleryImageWithSpeakers {
  return {
    _id: id,
    _rev: 'r1',
    _createdAt: '2025-06-12T10:00:00Z',
    _updatedAt: '2025-06-12T10:00:00Z',
    photographer: 'Olav Nordmann',
    date: '2025-06-12',
    location: 'Grieghallen, Bergen',
    featured: false,
    image: {
      _type: 'image',
      asset: {
        _ref: `image-${id.replace(/-/g, '')}0000000000000000000000000000-1920x1080-jpg`,
        _type: 'reference',
      },
    },
    speakers: [],
    ...overrides,
  } as GalleryImageWithSpeakers
}

const images: GalleryImageWithSpeakers[] = [
  mockImage('gal1', {
    location: 'Grieghallen, Bergen',
    imageAlt: 'Keynote presentation on the main stage',
    speakers: [
      // Matches the global SessionDecorator's speaker id so the
      // "Remove Me" self-untag affordance is visible in the capture.
      { _id: 'speaker-storybook', name: 'Storybook User', slug: 'storybook' },
      { _id: 'sp-2', name: 'Jane Doe', slug: 'jane-doe' },
    ],
  }),
  mockImage('gal2', {
    location: 'Workshop Room A',
    photographer: 'Kari Hansen',
    imageAlt: 'Hands-on workshop session',
    speakers: [{ _id: 'sp-3', name: 'Alice Johnson', slug: 'alice-johnson' }],
  }),
  mockImage('gal3', {
    location: 'Foyer',
    imageAlt: 'Networking break',
  }),
]

const placeholderSvg = (w: number, h: number, label: string, hue: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="${w}" height="${h}" fill="hsl(${hue} 40% 30%)"/>` +
  `<text x="50%" y="50%" fill="hsl(${hue} 30% 75%)" font-family="sans-serif" font-size="${Math.round(h / 12)}" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
  `</svg>`

const handlers = [
  // The Sanity image builder emits cdn.sanity.io URLs; serve deterministic
  // placeholders so the lightbox and thumbnail strip render real <img> content.
  http.get('https://cdn.sanity.io/images/*', ({ request }) => {
    const url = new URL(request.url)
    const match = /gal(\d)/.exec(url.pathname)
    const n = match ? Number(match[1]) : 1
    const thumb = url.searchParams.get('w') === '192'
    return new HttpResponse(
      placeholderSvg(
        thumb ? 192 : 1920,
        thumb ? 128 : 1080,
        `Photo ${n}`,
        [210, 150, 30][n - 1] ?? 210,
      ),
      { headers: { 'Content-Type': 'image/svg+xml' } },
    )
  }),
  http.post('/api/trpc/gallery.untagSelf', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Components/Feedback/GalleryModal',
  component: GalleryModal,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Full-screen gallery lightbox with image carousel, thumbnail navigation, speaker tags, and self-untag. A deliberate ModalShell exception: the full-bleed black lightbox opts out of the shared card/sheet shell but follows the same house bar — modern Headless UI v2 dialog, a labeled 44×44 close button, and a real accessible dialog name ("Photo gallery, image N of M"). Keyboard (← → Esc via `useImageCarousel`) and touch swipe are supported.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    images,
    onImageUpdated: fn(),
  },
} satisfies Meta<typeof GalleryModal>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The lightbox on its first image. The signed-in mock speaker is tagged in
 * this photo, so the "Remove Me" self-untag button is visible. The lightbox
 * uses a fixed black surface in both themes, so light and dark captures are
 * identical by design.
 */
export const Default: Story = {}

/** Opened at the second image via `initialIndex`. */
export const SecondImage: Story = {
  args: { initialIndex: 1 },
}
