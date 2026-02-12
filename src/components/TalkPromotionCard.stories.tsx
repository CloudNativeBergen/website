import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TalkPromotionCard } from './TalkPromotionCard'
import { Format, Language, Level, Audience, Status } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import type { Speaker } from '@/lib/speaker/types'
import { Flags } from '@/lib/speaker/types'

const mockSpeakers: Speaker[] = [
  {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    slug: 'alice-johnson',
    title: 'Senior Engineer at Google',
    flags: [Flags.localSpeaker],
  },
  {
    _id: 'speaker-2',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Bob Smith',
    email: 'bob@example.com',
    slug: 'bob-smith',
    title: 'DevOps Lead at Microsoft',
    flags: [Flags.firstTimeSpeaker],
  },
]

const mockTopics = [
  {
    _id: 'topic-1',
    _type: 'topic' as const,
    title: 'Kubernetes',
    slug: { current: 'kubernetes' },
    color: '326CE5',
  },
]

const createMockTalk = (
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting => ({
  _id: 'talk-promo-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Building Scalable Cloud Native Applications with Kubernetes',
  description: convertStringToPortableTextBlocks(
    'In this talk, we will explore best practices for building and deploying scalable applications on Kubernetes. We will cover horizontal pod autoscaling, resource management, and observability patterns.',
  ),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.architect],
  status: Status.confirmed,
  outline: '',
  topics: mockTopics,
  tos: true,
  speakers: mockSpeakers,
  conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
  ...overrides,
})

const meta = {
  title: 'Systems/Program/TalkPromotionCard',
  component: TalkPromotionCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Promotional card for highlighting individual talks. Supports three variants: default, featured (with blue border and badge), and compact (smaller layout without description). Displays talk format, level, topic, speakers, and schedule info.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'featured', 'compact'],
    },
  },
} satisfies Meta<typeof TalkPromotionCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    talk: createMockTalk(),
    ctaUrl: '/program/talk-1',
  },
}

export const Featured: Story = {
  args: {
    talk: createMockTalk(),
    variant: 'featured',
    ctaUrl: '/program/talk-1',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Featured variant with a blue border, shadow, and a Featured badge.',
      },
    },
  },
}

export const Compact: Story = {
  args: {
    talk: createMockTalk(),
    variant: 'compact',
    ctaUrl: '/program/talk-1',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Compact variant with smaller padding, no description, and duration shown inline.',
      },
    },
  },
}

export const WithSlot: Story = {
  args: {
    talk: createMockTalk(),
    slot: {
      date: 'September 15, 2025',
      time: '10:00 - 10:45',
      location: 'Main Stage',
    },
    ctaUrl: '/program/talk-1',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows schedule slot info (time, date, location) in the footer instead of duration.',
      },
    },
  },
}

export const LightningTalk: Story = {
  args: {
    talk: createMockTalk({
      title: '5 Tips for Better Kubernetes Debugging',
      format: Format.lightning_10,
      level: Level.beginner,
      speakers: [mockSpeakers[0]],
    }),
    ctaUrl: '/program/talk-lightning',
  },
}

export const Workshop: Story = {
  args: {
    talk: createMockTalk({
      title: 'Hands-on Kubernetes Workshop',
      format: Format.workshop_120,
      level: Level.beginner,
      speakers: mockSpeakers,
    }),
    variant: 'featured',
    ctaText: 'Register Now',
    ctaUrl: '/workshops/k8s',
  },
}

export const AllVariants: Story = {
  args: {
    talk: createMockTalk(),
  },
  render: () => (
    <div className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
      <TalkPromotionCard
        talk={createMockTalk()}
        ctaUrl="/program/talk-1"
        variant="default"
      />
      <TalkPromotionCard
        talk={createMockTalk()}
        ctaUrl="/program/talk-1"
        variant="featured"
      />
      <TalkPromotionCard
        talk={createMockTalk()}
        ctaUrl="/program/talk-1"
        variant="compact"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Side-by-side comparison of all three card variants.',
      },
    },
  },
}
