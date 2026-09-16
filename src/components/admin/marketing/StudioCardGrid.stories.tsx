import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import { StudioCardGrid } from './StudioCardGrid'

const meta = {
  title: 'Systems/Marketing/StudioCardGrid',
  component: StudioCardGrid,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StudioCardGrid>
export default meta

type Story = StoryObj<typeof meta>

function cards(names: string[], width: number, height: number) {
  return names.map((name) => (
    <div key={name} className="flex flex-col items-center">
      <DownloadableImage filename={name.toLowerCase()}>
        <div
          style={{ width, height }}
          className="flex flex-col items-center justify-center rounded-xl bg-brand-gradient p-6 text-center text-white"
        >
          <p className="text-sm">Cloud Native Days Norway</p>
          <h2 className="mt-4 text-2xl font-bold">{name}</h2>
        </div>
      </DownloadableImage>
    </div>
  ))
}

export const SpeakerTask: Story = {
  args: {
    selectedId: 'Ada Lovelace',
    label: 'speakers',
    className: 'grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4',
    children: cards(
      ['Ada Lovelace', 'Grace Hopper', 'Margaret Hamilton'],
      256,
      256,
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      within(
        canvas.getByRole('region', { name: 'Card for your Task' }),
      ).getByText('Ada Lovelace'),
    ).toBeVisible()
    const grid = within(canvas.getByRole('region', { name: 'All speakers' }))
    await expect(grid.getByText('Ada Lovelace')).toBeVisible()
    await expect(grid.getByText('Grace Hopper')).toBeVisible()
    await expect(grid.getByText('Margaret Hamilton')).toBeVisible()
  },
}

export const SponsorTask: Story = {
  args: {
    selectedId: 'Acme',
    label: 'sponsors',
    className: 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3',
    children: cards(['Acme', 'Cloud Partners', 'Nordic Labs'], 400, 225),
  },
}
