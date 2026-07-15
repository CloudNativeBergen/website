import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { NotSeeingTalksPrompt } from './NotSeeingTalksPrompt'

const meta = {
  title: 'Systems/CFP/NotSeeingTalksPrompt',
  component: NotSeeingTalksPrompt,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'In-product guidance on the speaker dashboard for the most common duplicate-account symptom: signing in with one provider (e.g. LinkedIn) and seeing an empty/incomplete proposal list because the talks live on another provider\'s speaker document. When the speaker has no proposals it shows a prominent card (Step 1: link the other provider via `LinkedProviders`; Step 2: contact the organizers). When they already have proposals it collapses into a subtle "Missing a talk?" affordance.',
      },
    },
  },
  args: {
    contactEmail: 'organizers@cloudnativedays.no',
    onLinkAction: fn(),
  },
  argTypes: {
    hasProposals: {
      control: 'boolean',
      description: 'Prominent card when false; subtle affordance when true.',
    },
    providers: {
      control: 'object',
      description: 'Raw `speaker.providers[]` entries, e.g. "linkedin:456".',
    },
    currentProvider: {
      control: 'select',
      options: [undefined, 'github', 'linkedin'],
      description: 'Provider the speaker is currently signed in with.',
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotSeeingTalksPrompt>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Zero-proposals case: the prominent card. Speaker is signed in with LinkedIn,
 * so GitHub is offered as the account to link (Step 1), with "contact the
 * organizers" as the Step 2 fallback.
 */
export const NoProposals: Story = {
  args: {
    hasProposals: false,
    providers: ['linkedin:abcdef'],
    currentProvider: 'linkedin',
  },
}

/**
 * Zero proposals but no organizer contact email configured — Step 2 falls back
 * to a link into the profile page's sign-in methods section.
 */
export const NoProposalsWithoutContactEmail: Story = {
  args: {
    hasProposals: false,
    providers: ['linkedin:abcdef'],
    currentProvider: 'linkedin',
    contactEmail: undefined,
  },
}

/**
 * Has-proposals case: only the subtle, collapsible "Missing a talk?" link. Open
 * it (in the canvas) to reveal the same guidance without cluttering the normal
 * dashboard.
 */
export const HasProposals: Story = {
  args: {
    hasProposals: true,
    providers: ['github:1234567'],
    currentProvider: 'github',
  },
}
