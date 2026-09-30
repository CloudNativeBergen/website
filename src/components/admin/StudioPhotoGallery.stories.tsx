import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { StudioPhotoGallery } from './StudioPhotoGallery'

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

const handlers = (previousPhotos: unknown[]) => [
  http.get('/api/trpc/gallery.admin.editions', () =>
    HttpResponse.json({ result: { data: EDITIONS } }),
  ),
  http.get('/api/trpc/gallery.admin.list', () =>
    HttpResponse.json({ result: { data: previousPhotos } }),
  ),
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
        'Cloud Native Bergen 2026 has no featured photos.',
      ),
    ).toBeVisible()
  },
}

export const PreviousEditionEmptyDark: Story = {
  play: PreviousEditionEmpty.play,
  parameters: { theme: 'dark' },
}
