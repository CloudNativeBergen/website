import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { VideoEmbed } from './VideoEmbed'

const meta = {
  title: 'Components/VideoEmbed',
  component: VideoEmbed,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Privacy-preserving video embed supporting YouTube and Vimeo. Uses youtube-nocookie.com for YouTube and dnt=1 for Vimeo to minimize tracking.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    url: {
      control: 'text',
      description: 'YouTube or Vimeo video URL',
    },
    title: {
      control: 'text',
      description: 'Accessible title for the iframe',
    },
  },
} satisfies Meta<typeof VideoEmbed>

export default meta
type Story = StoryObj<typeof meta>

export const YouTube: Story = {
  args: {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Example YouTube Video',
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}

export const Vimeo: Story = {
  args: {
    url: 'https://vimeo.com/148751763',
    title: 'Example Vimeo Video',
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}

export const InvalidUrl: Story = {
  args: {
    url: 'https://example.com/not-a-video',
    title: 'Invalid Video',
  },
}

export const PrivacyFeatures: Story = {
  args: {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Example Video',
  },
  render: () => (
    <div className="space-y-6">
      <div className="rounded-lg border border-brand-cloud-blue/20 bg-brand-sky-mist p-6">
        <h3 className="mb-4 font-space-grotesk text-lg font-semibold text-brand-cloud-blue">
          Privacy-First Video Embedding
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-4 dark:bg-gray-800">
            <h4 className="mb-2 font-semibold text-brand-slate-gray dark:text-white">
              YouTube
            </h4>
            <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>• Uses youtube-nocookie.com domain</li>
              <li>• No tracking cookies until playback</li>
              <li>• GDPR-friendly implementation</li>
            </ul>
          </div>
          <div className="rounded-lg bg-white p-4 dark:bg-gray-800">
            <h4 className="mb-2 font-semibold text-brand-slate-gray dark:text-white">
              Vimeo
            </h4>
            <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>• Uses dnt=1 parameter</li>
              <li>• Disables tracking and analytics</li>
              <li>• Respects Do Not Track</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="max-w-2xl">
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
          Example embed (YouTube):
        </p>
        <VideoEmbed
          url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          title="Example Video"
        />
      </div>
    </div>
  ),
}
