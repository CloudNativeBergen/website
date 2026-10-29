import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlanFeaturesCard } from './PlanFeaturesCard'
import { WORKSHOPS_INACTIVE_REASON } from './planFeatureRows'

/**
 * Read-only "Plan & Features" settings card: the current org's plan badge plus
 * its entitled features with readiness chips. Rows mirror what the server page
 * derives via `listEntitledFeatures` — a community org with no overrides shows
 * the empty state, a pro org shows its GA entitlements, and override-granted
 * beta/internal features carry the extra "Override" chip.
 */
const meta = {
  title: 'Systems/Settings/Admin/PlanFeaturesCard',
  component: PlanFeaturesCard,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 dark:bg-gray-950">
        <div className="mx-auto max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof PlanFeaturesCard>

export default meta
type Story = StoryObj<typeof meta>

export const CommunityEmpty: Story = {
  args: {
    plan: 'community',
    features: [],
  },
}

export const ProPlan: Story = {
  args: {
    plan: 'pro',
    features: [
      {
        id: 'dedicated-email',
        title: 'Dedicated email sending',
        description:
          "Outbound email from the organization's own verified sender domain instead of the shared platform sender.",
        readiness: 'ga',
        viaOverride: false,
      },
    ],
  },
}

/**
 * #1295: a pro org whose ticketing is not connected yet. The plan lists
 * workshops, the resolver says off, so the row stays — muted, "Inactive", and
 * with the one sentence that tells the org what unlocks it.
 */
export const ProPlanWorkshopsInactive: Story = {
  args: {
    plan: 'pro',
    features: [
      {
        id: 'dedicated-email',
        title: 'Dedicated email sending',
        description:
          "Outbound email from the organization's own verified sender domain instead of the shared platform sender.",
        readiness: 'ga',
        viaOverride: false,
      },
      {
        id: 'workshops',
        title: 'Workshop portal',
        description:
          'Attendee workshop sign-up portal, organizer workshop management, and the automatic workshop instructions email sent on every workshop ticket sale. Requires the ticketing integration, which decides who holds a workshop ticket.',
        readiness: 'ga',
        viaOverride: false,
        inactiveReason: WORKSHOPS_INACTIVE_REASON,
      },
      {
        id: 'ticketing',
        title: 'Ticketing integration',
        description:
          'Organizer ticket sales, orders, ticket types, discount codes and company breakdown, read live from the conference’s ticketing provider (Checkin.no or Tito).',
        readiness: 'ga',
        viaOverride: false,
      },
    ],
  },
}

export const EnterpriseWithOverrides: Story = {
  args: {
    plan: 'enterprise',
    features: [
      {
        id: 'dedicated-email',
        title: 'Dedicated email sending',
        description:
          "Outbound email from the organization's own verified sender domain instead of the shared platform sender.",
        readiness: 'ga',
        viaOverride: false,
      },
      {
        id: 'graphql-api',
        title: 'GraphQL API',
        description:
          'Programmatic read access to conference content over a public GraphQL endpoint.',
        readiness: 'internal',
        viaOverride: true,
      },
      {
        id: 'slack-mirror',
        title: 'Slack mirroring',
        description:
          "Mirror speaker and sponsor conversations into the organization's Slack workspace.",
        readiness: 'internal',
        viaOverride: true,
      },
    ],
  },
}
