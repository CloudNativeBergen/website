import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ImageGrid } from './ImageGrid'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

/**
 * The admin gallery grid, editable for the current edition and READ-ONLY when
 * browsing a previous edition (#1191): no selection, no edit / feature /
 * delete controls, and a card click selects nothing.
 */

const image = (id: string, featured = false): GalleryImageWithSpeakers => ({
  _id: id,
  _rev: 'rev-1',
  _createdAt: '2025-10-28T14:30:00Z',
  _updatedAt: '2025-10-28T14:30:00Z',
  photographer: 'Olav Nordmann',
  date: '2025-10-28T14:30:00Z',
  location: 'Grieghallen, Bergen',
  featured,
  image: {
    _type: 'image',
    asset: {
      _ref: 'image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg',
      _type: 'reference',
    },
    alt: `Picture ${id}`,
  },
  imageAlt: `Picture ${id}`,
  speakers: [],
})

const IMAGES = [image('img-1', true), image('img-2'), image('img-3')]

const meta = {
  title: 'Systems/Proposals/Admin/Gallery/ImageGrid',
  component: ImageGrid,
  parameters: { layout: 'fullscreen' },
  args: {
    images: IMAGES,
    onImageUpdate: fn(),
    onImageDelete: fn(),
    onToggleFeatured: fn(async () => {}),
    selectedImages: [],
    onSelectionChange: fn(),
    onBulkTag: fn(),
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <div className={dark ? 'dark' : ''}>
          <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
            <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-900">
              <Story />
            </div>
          </div>
        </div>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ImageGrid>

export default meta
type Story = StoryObj<typeof meta>

/** The current edition: selection and the per-card controls are available. */
export const Editable: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Select all images' }),
    ).toBeVisible()
    await expect(canvas.getAllByTitle('Edit metadata')).toHaveLength(3)
    // Clicking a card's checkbox selects it.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Select Picture img-2' }),
    )
    await expect(args.onSelectionChange).toHaveBeenCalledWith(['img-2'])
  },
}

/**
 * A previous edition: pictures only. The selection is deliberately NON-empty
 * (a stale one from the current edition): with a selection, a card click is
 * what would normally toggle it, so `readOnly` is the only thing stopping it.
 */
export const ReadOnly: Story = {
  args: { readOnly: true, selectedImages: ['img-1'] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('img')).toHaveLength(3)
    await expect(
      canvas.queryByRole('button', { name: 'Select all images' }),
    ).toBeNull()
    await expect(canvas.queryByText('1 selected')).toBeNull()
    await expect(canvas.queryByTitle('Edit metadata')).toBeNull()
    await expect(canvas.queryByTitle('Delete image')).toBeNull()
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
    // Clicking a card selects nothing.
    const card = canvas.getByAltText('Picture img-2').closest('.group')!
    await userEvent.click(card as HTMLElement)
    await userEvent.click(canvas.getByAltText('Picture img-2'))
    await expect(args.onSelectionChange).not.toHaveBeenCalled()
  },
}

export const ReadOnlyDark: Story = {
  args: ReadOnly.args,
  play: ReadOnly.play,
  parameters: { theme: 'dark' },
}
