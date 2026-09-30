import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { StudioPhotoGallery } from './StudioPhotoGallery'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

/**
 * The studio's photo-gallery tab with the EDITION control (#1191). A fresh
 * edition has no featured photos of its own, so the empty state points at the
 * previous editions the server lists; picking one reads that edition's
 * featured photos.
 */

const EDITIONS = {
  current: { _id: 'conf-2027', title: 'Cloud Native Bergen 2027' },
  previous: [
    {
      _id: 'conf-2026',
      title: 'Cloud Native Bergen 2026',
      startDate: '2026-10-28',
      endDate: '2026-10-29',
    },
  ],
}

const photo = (n: number): GalleryImageWithSpeakers => ({
  _id: `img-${n}`,
  _rev: 'rev-1',
  _createdAt: '2026-10-28T14:30:00Z',
  _updatedAt: '2026-10-28T14:30:00Z',
  photographer: 'Olav Nordmann',
  date: '2026-10-28T14:30:00Z',
  location: 'Grieghallen, Bergen',
  featured: true,
  image: {
    _type: 'image',
    asset: { _ref: `image-${n}-1600x900-jpg`, _type: 'reference' },
    alt: `Previous-edition picture ${n}`,
  },
  imageUrl: svgImage(1600, 900, n),
  imageAlt: `Previous-edition picture ${n}`,
  speakers: [],
})

function svgImage(w: number, h: number, n: number): string {
  const hue = (n * 37) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue} 60% 45%)"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const PREVIOUS_PHOTOS = Array.from({ length: 9 }, (_, i) => photo(i + 1))

/**
 * The list handler answers ONLY the read the tab is supposed to make —
 * `{ edition: "conf-2026", featured: true }` — so a story showing photos
 * proves that input was sent.
 */
const handlers = (previousPhotos: unknown[]) => [
  http.get('/api/trpc/gallery.admin.editions', () =>
    HttpResponse.json({ result: { data: EDITIONS } }),
  ),
  http.get('/api/trpc/gallery.admin.list', ({ request }) => {
    const raw = new URL(request.url).searchParams.get('input')
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const input = (parsed.json ?? parsed) as {
      edition?: string
      featured?: boolean
    }
    const data =
      input.edition === 'conf-2026' && input.featured === true
        ? previousPhotos
        : []
    return HttpResponse.json({ result: { data } })
  }),
]

const meta = {
  title: 'Systems/Marketing/Admin/StudioPhotoGallery',
  component: StudioPhotoGallery,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlers([]) },
    docs: {
      description: {
        component:
          'Photo-gallery tab of the promo studio: the current edition’s featured photos, or a previous edition’s via the edition select (#1191). Resolves dark mode from `parameters.theme` via the local decorator.',
      },
    },
  },
  args: {
    photos: [],
    conferenceTitle: 'Cloud Native Bergen 2027',
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <div className={dark ? 'dark' : ''}>
          <div className="min-h-screen bg-white p-6 dark:bg-gray-950">
            <Story />
          </div>
        </div>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof StudioPhotoGallery>

export default meta
type Story = StoryObj<typeof meta>

/** A new edition with no featured photos yet: the empty state offers the previous editions. */
export const FreshEdition: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('combobox', { name: 'Edition' }),
    ).toBeVisible()
    await expect(
      canvas.getByText(/Pick a previous edition above/),
    ).toBeVisible()
  },
}

/** A previous edition chosen that has no featured photos either: said so by name. */
export const PreviousEditionEmpty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const select = await canvas.findByRole('combobox', { name: 'Edition' })
    await userEvent.selectOptions(select, 'conf-2026')
    await expect(
      await canvas.findByText(
        /Cloud Native Bergen 2026 has no featured photos\./,
      ),
    ).toBeVisible()
  },
}

export const PreviousEditionEmptyDark: Story = {
  play: PreviousEditionEmpty.play,
  parameters: { theme: 'dark' },
}

/** A previous edition WITH featured photos: the collage is built from them. */
export const PreviousEditionWithPhotos: Story = {
  parameters: { msw: { handlers: handlers(PREVIOUS_PHOTOS) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const select = await canvas.findByRole('combobox', { name: 'Edition' })
    await userEvent.selectOptions(select, 'conf-2026')
    const pictures = await canvas.findAllByAltText(/Previous-edition picture/)
    await expect(pictures.length).toBeGreaterThan(0)
    await expect(canvas.queryByText(/has no featured photos/)).toBeNull()
  },
}
