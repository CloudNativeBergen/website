import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeaturedSpeakerTile } from './FeaturedSpeakerTile'
import {
  longTitleSpeaker,
  noImageSpeaker,
  workshopSpeaker,
} from './featuredSpeakers.mocks'

const meta = {
  title: 'Systems/Speakers/FeaturedSpeakersShelf/Tile',
  component: FeaturedSpeakerTile,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A single photo-forward overlay tile used by the Featured Speakers shelf. The whole tile links to the speaker profile (via a stretched pseudo-element on the name link) while the accessible link text stays the speaker name. A bottom scrim keeps the caption legible over the portrait.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof FeaturedSpeakerTile>

export default meta
type Story = StoryObj<typeof meta>

export const Workshop: Story = {
  args: { speaker: workshopSpeaker },
  parameters: {
    docs: {
      description: {
        story:
          'A speaker running a workshop shows the sunbeam-yellow "Workshop" badge in the top-left corner.',
      },
    },
  },
}

export const LongTitle: Story = {
  args: { speaker: longTitleSpeaker },
  parameters: {
    docs: {
      description: {
        story:
          'A very long title is clamped to a single line so the overlay caption stays legible.',
      },
    },
  },
}

export const NoImage: Story = {
  args: { speaker: noImageSpeaker },
  parameters: {
    docs: {
      description: {
        story:
          'Without a photo the tile falls back to initials on a brand-tinted gradient instead of a broken frame.',
      },
    },
  },
}
