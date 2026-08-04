import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ImageGallery } from './ImageGallery'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

/**
 * Homepage photo-gallery band. The heading and description are per-section
 * config on the `homepageGallery` block — `Default` renders the built-in house
 * copy (what every existing site sees), `CustomCopy` a tenant override.
 */

function mockImage(id: string, label: string): GalleryImageWithSpeakers {
  return {
    _id: id,
    _rev: 'r1',
    _createdAt: '2025-06-12T10:00:00Z',
    _updatedAt: '2025-06-12T10:00:00Z',
    photographer: 'Olav Nordmann',
    date: '2025-06-12',
    location: 'Grieghallen, Bergen',
    featured: true,
    imageAlt: label,
    image: {
      _type: 'image',
      asset: {
        _ref: `image-${id.replace(/-/g, '')}0000000000000000000000000000-1920x1080-jpg`,
        _type: 'reference',
      },
    },
    speakers: [],
  } as unknown as GalleryImageWithSpeakers
}

const featuredImages: GalleryImageWithSpeakers[] = [
  mockImage('gal1', 'Keynote presentation on the main stage'),
  mockImage('gal2', 'Hands-on workshop session'),
  mockImage('gal3', 'Networking break'),
]

const placeholderSvg = (w: number, h: number, label: string, hue: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="${w}" height="${h}" fill="hsl(${hue} 40% 30%)"/>` +
  `<text x="50%" y="50%" fill="hsl(${hue} 30% 75%)" font-family="sans-serif" font-size="${Math.round(h / 12)}" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
  `</svg>`

const handlers = [
  http.get('https://cdn.sanity.io/images/*', ({ request }) => {
    const url = new URL(request.url)
    const match = /gal(\d)/.exec(url.pathname)
    const n = match ? Number(match[1]) : 1
    return new HttpResponse(
      placeholderSvg(1920, 1080, `Photo ${n}`, [210, 150, 30][n - 1] ?? 210),
      { headers: { 'Content-Type': 'image/svg+xml' } },
    )
  }),
]

const meta = {
  title: 'Systems/Homepage/Public/ImageGallery',
  component: ImageGallery,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Front-page photo carousel band. Heading and description default to the house copy and are overridable per section (front-page builder).',
      },
    },
  },
  args: { featuredImages },
} satisfies Meta<typeof ImageGallery>

export default meta
type Story = StoryObj<typeof meta>

/** House defaults — byte-identical to the pre-config copy. */
export const Default: Story = {}

export const DefaultDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}

/** A tenant replacing the house copy with its own voice. */
export const CustomCopy: Story = {
  args: {
    heading: 'Photos from last year',
    description:
      'A look back at the 2025 edition — talks, hallway track and the after-party.',
  },
}
