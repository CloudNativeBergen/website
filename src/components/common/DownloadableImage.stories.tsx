import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DownloadableImage } from './DownloadableImage'

const meta = {
  title: 'Components/Data Display/DownloadableImage',
  component: DownloadableImage,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DownloadableImage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    filename: 'example-card',
    children: (
      <div className="flex h-64 w-96 flex-col items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-purple-700 p-6 text-center text-white">
        <h2 className="text-2xl font-bold">Jane Smith</h2>
        <p className="mt-2 text-sm opacity-90">Cloud Native Days Norway 2025</p>
        <p className="mt-1 text-xs opacity-75">Speaker</p>
      </div>
    ),
  },
}

export const WithCustomContent: Story = {
  args: {
    filename: 'sponsor-badge',
    children: (
      <div className="flex h-48 w-80 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800">
        <p className="text-lg font-semibold text-gray-900 dark:text-white">
          Any Content
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Wrap any component to make it downloadable as PNG
        </p>
      </div>
    ),
  },
}
