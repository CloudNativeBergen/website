import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { MetricsBlock } from './MetricsBlock'
import type { Conference } from '@/lib/conference/types'

/**
 * The numbers a conference already keeps on the conference document
 * (`vanityMetrics`) — the same source the Hero reads, so a tenant can surface
 * them a second time lower down the page without re-entering anything.
 */
const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Bergen 2026',
  vanityMetrics: [
    { label: 'Attendees', value: '480' },
    { label: 'Sessions', value: '32' },
    { label: 'Speakers', value: '28' },
    { label: 'Workshops', value: '4' },
    { label: 'Tracks', value: '3' },
    { label: 'Sponsors', value: '12' },
  ],
} as unknown as Conference

/** The realistic small-event case: three numbers, not six. */
const smallConference = {
  ...conference,
  vanityMetrics: [
    { label: 'Sessions', value: '14' },
    { label: 'Speakers', value: '12' },
    { label: 'Countries', value: '5' },
  ],
} as unknown as Conference

const meta = {
  title: 'Systems/Homepage/Public/MetricsBlock',
  component: MetricsBlock,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F2) vanity-metrics band. Content comes from `conference.vanityMetrics`; the section carries only an optional heading, and the band renders nothing when no metrics are configured. Two variants: `row` (the default — a plain grid on the page background) and `band` (the same numbers on a full-bleed brand-tinted strip, with the value reading before its label). Capped at six metrics either way.',
      },
    },
  },
  argTypes: {
    section: { control: false },
    conference: { control: false },
  },
  args: { conference },
  tags: ['autodocs'],
} satisfies Meta<typeof MetricsBlock>

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

/* ------------------------------- row (default) -------------------------- */

export const Default: Story = {
  args: {
    section: {
      _key: 'metrics-1',
      _type: 'homepageMetrics',
      heading: 'The 2025 edition in numbers',
    },
  },
}

/** No heading — the numbers stand on their own between two content bands. */
export const NoHeading: Story = {
  args: { section: { _key: 'metrics-2', _type: 'homepageMetrics' } },
}

export const Dark: Story = {
  args: Default.args,
  ...dark,
}

/* --------------------------------- band --------------------------------- */

/**
 * `band`: the tint is painted on the section, so it runs edge to edge and
 * breaks the page between two content bands. Both the surface and the hairline
 * are alpha shades of the tenant's brand colour, so a themed conference gets
 * its own band rather than the house blue.
 */
export const Band: Story = {
  args: {
    section: {
      _key: 'metrics-3',
      _type: 'homepageMetrics',
      variant: 'band',
      heading: 'The 2025 edition in numbers',
    },
  },
}

export const BandDark: Story = {
  args: Band.args,
  ...dark,
}

/** The band without a heading — pure colour block. */
export const BandNoHeading: Story = {
  args: {
    section: {
      _key: 'metrics-4',
      _type: 'homepageMetrics',
      variant: 'band',
    },
  },
}

/** Three metrics rather than six: the grid must not leave a ragged half-row. */
export const BandThreeMetrics: Story = {
  args: {
    conference: smallConference,
    section: {
      _key: 'metrics-5',
      _type: 'homepageMetrics',
      variant: 'band',
      heading: 'Our first year',
    },
  },
}
