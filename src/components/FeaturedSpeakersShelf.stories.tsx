import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeaturedSpeakersShelf } from './FeaturedSpeakersShelf'
import { mockFeaturedSpeakers } from './featuredSpeakers.mocks'

const meta = {
  title: 'Systems/Speakers/FeaturedSpeakersShelf',
  component: FeaturedSpeakersShelf,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A horizontal peek-and-snap shelf of photo-forward speaker overlay tiles for the conference front page. Manual only (no auto-advance): tiles snap into place, the next tile peeks at the right edge, desktop shows prev/next arrows, and the row is a focusable region that keyboard users can arrow-scroll. Ends with a dashed "View all speakers" endcap linking to /speaker. Respects prefers-reduced-motion.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="bg-white px-6 py-12 dark:bg-gray-950">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-space-grotesk mb-2 text-4xl font-medium tracking-tighter text-brand-cloud-blue dark:text-blue-400">
            Featured Speakers
          </h2>
          <Story />
        </div>
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof FeaturedSpeakersShelf>

export default meta
type Story = StoryObj<typeof meta>

export const Desktop: Story = {
  args: { speakers: mockFeaturedSpeakers },
  parameters: {
    docs: {
      description: {
        story:
          'Desktop layout: roughly three tiles plus a peek of the next, with working prev/next arrows in the top-right.',
      },
    },
  },
}

export const Mobile: Story = {
  args: { speakers: mockFeaturedSpeakers },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'Mobile layout: one and a half tiles visible (a clear peek of the next), navigated by touch swipe — arrows are hidden.',
      },
    },
  },
}

export const FewSpeakers: Story = {
  args: { speakers: mockFeaturedSpeakers.slice(0, 2) },
  parameters: {
    docs: {
      description: {
        story:
          'With only a couple of speakers the shelf still renders cleanly, ending with the "View all speakers" endcap.',
      },
    },
  },
}
