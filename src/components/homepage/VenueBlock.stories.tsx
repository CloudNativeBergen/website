import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { VenueBlock } from './VenueBlock'
import type { Conference } from '@/lib/conference/types'

const withVenue = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1\n5015 Bergen\nNorway',
} as unknown as Conference

const nameOnly = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  venueName: 'Grieghallen',
} as unknown as Conference

const meta = {
  title: 'Systems/Homepage/Public/VenueBlock',
  component: VenueBlock,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F4) venue block. Two variants: `card` (the default — a centred, hero-style card) and `split` (heading and description beside the address card on wide screens, a quieter "practical information" band). Name/address come from the conference; the "Get directions" link is constructed from the venue name and address (either alone suffices) at render (no map tiles/embeds, no stored URL) in BOTH variants. Renders nothing without a venue name or address.',
      },
    },
  },
  argTypes: {
    section: { control: false },
    conference: { control: false },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof VenueBlock>

export default meta
type Story = StoryObj<typeof meta>

const darkDecorator: Decorator[] = [
  (Story) => (
    <div className="dark bg-gray-950">
      <Story />
    </div>
  ),
]

const dark = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: darkDecorator,
}

/* -------------------------------- card (default) ------------------------ */

export const Default: Story = {
  args: {
    conference: withVenue,
    section: {
      _key: 'venue-1',
      _type: 'homepageVenue',
      heading: 'Where to find us',
      description:
        'In the heart of Bergen, a short walk from the train station.',
    },
  },
}

/** Edge case: venue name but no address → no "Get directions" for the address. */
export const NameOnly: Story = {
  args: {
    conference: nameOnly,
    section: {
      _key: 'venue-2',
      _type: 'homepageVenue',
    },
  },
}

export const Dark: Story = {
  args: Default.args,
  ...dark,
}

/* -------------------------------- split --------------------------------- */

/**
 * `split`: the same facts, weighted as practical information rather than as a
 * centrepiece. Copy on the left, the address card on the right from `lg` up;
 * one stacked column on a phone.
 */
export const Split: Story = {
  args: {
    conference: withVenue,
    section: {
      _key: 'venue-3',
      _type: 'homepageVenue',
      variant: 'split',
      heading: 'Getting to Grieghallen',
      description:
        'Four minutes on foot from the Bybanen stop at Nonneseteret, and ten from Bergen station. The main entrance faces Edvard Griegs plass; step-free access and a cloakroom are on the ground floor.',
    },
  },
}

export const SplitDark: Story = {
  args: Split.args,
  ...dark,
}
