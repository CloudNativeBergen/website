import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeaturedSpeakersSectionView } from './FeaturedSpeakersSection'
import { peopleConference, manyFeaturedSpeakers } from './peopleSections.mocks'
import { resolveHomepageLifecycle } from '@/lib/homepage/lifecycle'

/**
 * The two presentations of the featured-speakers band, side by side for review.
 *
 * `shelf` (DEFAULT, today's rendering) is a horizontally scrolling peek-and-snap
 * row — curated, cinematic, and it hides most of the line-up behind a swipe.
 * `grid` shows every featured speaker at once in an even wall that densifies
 * with the viewport (2 → 3 → 4 → 5 columns), for conferences whose breadth is
 * the pitch. The heading, the copy and the phase CTA row are identical in both.
 */

const lifecycle = resolveHomepageLifecycle(peopleConference)

const meta = {
  title: 'Systems/Homepage/Public/FeaturedSpeakersVariants',
  component: FeaturedSpeakersSectionView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Variant matrix for the homepage featured-speakers band: `shelf` (default) versus `grid`. Ten speakers, including a very long title, a speaker with no portrait and a workshop badge.',
      },
    },
  },
  args: {
    conference: peopleConference,
    lifecycle,
    ticketsFromPrice: '3 490',
  },
} satisfies Meta<typeof FeaturedSpeakersSectionView>

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

export const Shelf: Story = {
  args: {
    section: { _key: 'f', _type: 'homepageFeaturedSpeakers' },
  },
  decorators: light,
  parameters: {
    docs: {
      description: {
        story:
          'The DEFAULT. An absent variant renders exactly this — the horizontally scrolling shelf, with desktop prev/next arrows and a dashed "View all speakers" endcap after the last tile.',
      },
    },
  },
}

export const ShelfDark: Story = {
  ...Shelf,
  decorators: dark,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const Grid: Story = {
  args: {
    section: {
      _key: 'f',
      _type: 'homepageFeaturedSpeakers',
      variant: 'grid',
      heading: 'The 2026 line-up',
      description: 'Forty speakers across four tracks — here are ten of them.',
    },
  },
  decorators: light,
  parameters: {
    docs: {
      description: {
        story:
          'The `grid` variant: no scroller, no client state, every speaker visible. Two columns on mobile, five at xl, with the same endcap tile closing the wall.',
      },
    },
  },
}

export const GridDark: Story = {
  ...Grid,
  decorators: dark,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/**
 * The case that motivates the variant: with only three speakers a carousel
 * reads as broken (nothing to scroll), while the grid simply centres a short
 * row.
 */
export const GridWithFewSpeakers: Story = {
  args: {
    section: {
      _key: 'f',
      _type: 'homepageFeaturedSpeakers',
      variant: 'grid',
    },
    conference: {
      ...peopleConference,
      featuredSpeakers: manyFeaturedSpeakers.slice(0, 3),
    },
  },
  decorators: light,
}
