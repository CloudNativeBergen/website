import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OrganizersSectionView } from './OrganizersSection'
import { peopleConference, largeOrganizingTeam } from './peopleSections.mocks'
import { resolveHomepageLifecycle } from '@/lib/homepage/lifecycle'

/**
 * The two presentations of the organizers band, side by side for review.
 *
 * `cards` (DEFAULT, today's rendering) gives every organizer a full promotion
 * card — chrome, an "Organizer" pill and a 140px portrait. `compact` collapses
 * the same people into a dense roster of small round portraits with the name
 * and one clamped role line, for teams large enough that cards would take over
 * the page. Heading, sort order and phase CTA row are identical in both.
 */

const lifecycle = resolveHomepageLifecycle(peopleConference)

const meta = {
  title: 'Systems/Homepage/Public/OrganizersVariants',
  component: OrganizersSectionView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Variant matrix for the homepage organizers band: `cards` (default) versus `compact`. A twelve-person committee, including two people with no portrait, one very long role and non-ASCII names.',
      },
    },
  },
  args: {
    conference: peopleConference,
    lifecycle,
    ticketsFromPrice: '3 490',
  },
} satisfies Meta<typeof OrganizersSectionView>

export default meta
type Story = StoryObj<typeof meta>

const dark = [
  (Story: () => React.ReactElement) => (
    <div className="dark bg-gray-950">
      <Story />
    </div>
  ),
]

const light = [
  (Story: () => React.ReactElement) => (
    <div className="bg-white">
      <Story />
    </div>
  ),
]

export const Cards: Story = {
  args: {
    section: { _key: 'o', _type: 'homepageOrganizers' },
  },
  decorators: light,
  parameters: {
    docs: {
      description: {
        story:
          'The DEFAULT. An absent variant renders exactly this — one `SpeakerPromotionCard` per organizer, two columns on mobile and three from lg.',
      },
    },
  },
}

export const CardsDark: Story = {
  ...Cards,
  decorators: dark,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const Compact: Story = {
  args: {
    section: {
      _key: 'o',
      _type: 'homepageOrganizers',
      variant: 'compact',
      heading: 'The team behind the conference',
      description:
        'Twelve volunteers who put this together in their spare time.',
    },
  },
  decorators: light,
  parameters: {
    docs: {
      description: {
        story:
          'The `compact` variant: the same twelve people in roughly a fifth of the vertical space. One column on mobile, two at sm, three from lg.',
      },
    },
  },
}

export const CompactDark: Story = {
  ...Compact,
  decorators: dark,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/**
 * A small committee in the compact treatment — the roster must not look sparse
 * or broken when a tenant picks it with only four people.
 */
export const CompactSmallTeam: Story = {
  args: {
    section: { _key: 'o', _type: 'homepageOrganizers', variant: 'compact' },
    conference: {
      ...peopleConference,
      organizers: largeOrganizingTeam.slice(0, 4),
    },
  },
  decorators: light,
}
