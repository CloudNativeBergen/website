import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalCard } from './ProposalCard'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { Speaker, Flags } from '@/lib/speaker/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

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

import { Topic } from '@/lib/topic/types'

const mockTopics: Topic[] = [
  { _id: 'topic-1', _type: 'topic', title: 'Kubernetes', color: '326CE5', slug: { current: 'kubernetes' } },
  { _id: 'topic-2', _type: 'topic', title: 'DevOps', color: 'FF6B35', slug: { current: 'devops' } },
]

const createMockProposal = (
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting => ({
  _id: 'proposal-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Building Scalable Kubernetes Applications',
  description: convertStringToPortableTextBlocks(
    'Learn how to build and deploy scalable applications on Kubernetes with best practices for production environments.',
  ),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.operator],
  status: Status.submitted,
  outline: 'Introduction, Architecture, Demo, Q&A',
  topics: mockTopics,
  tos: true,
  speakers: mockSpeakers,
  conference: { _type: 'reference', _ref: 'conf-1' },
  reviews: [
    {
      _id: 'review-1',
      _rev: '1',
      _createdAt: '2024-01-15T00:00:00Z',
      _updatedAt: '2024-01-15T00:00:00Z',
      comment: 'Great proposal!',
      score: { content: 4, relevance: 4, speaker: 4 },
      reviewer: { _type: 'reference', _ref: 'reviewer-1' },
      proposal: { _type: 'reference', _ref: 'proposal-1' },
    },
    {
      _id: 'review-2',
      _rev: '1',
      _createdAt: '2024-01-16T00:00:00Z',
      _updatedAt: '2024-01-16T00:00:00Z',
      comment: 'Very relevant topic.',
      score: { content: 5, relevance: 5, speaker: 5 },
      reviewer: { _type: 'reference', _ref: 'reviewer-2' },
      proposal: { _type: 'reference', _ref: 'proposal-1' },
    },
  ],
  ...overrides,
})

const meta: Meta<typeof ProposalCard> = {
  title: 'Admin/Proposals/ProposalCard',
  component: ProposalCard,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays a proposal summary card with speaker avatars, status badge, rating, and metadata. Used in the admin proposal list view.',
      },
    },
  },
  argTypes: {
    isSelected: {
      control: 'boolean',
      description: 'Whether the card is selected',
    },
  },
}

export default meta
type Story = StoryObj<typeof ProposalCard>

export const Submitted: Story = {
  args: {
    proposal: createMockProposal({ status: Status.submitted }),
    href: '/admin/proposals/proposal-1',
  },
}

export const Draft: Story = {
  args: {
    proposal: createMockProposal({
      status: Status.draft,
      title: 'Introduction to GitOps',
      format: Format.lightning_10,
      level: Level.beginner,
      reviews: [],
    }),
    href: '/admin/proposals/proposal-2',
  },
}

export const Accepted: Story = {
  args: {
    proposal: createMockProposal({
      status: Status.accepted,
      title: 'Advanced Service Mesh Patterns',
      format: Format.presentation_40,
      level: Level.advanced,
    }),
    href: '/admin/proposals/proposal-3',
  },
}

export const Confirmed: Story = {
  args: {
    proposal: createMockProposal({
      status: Status.confirmed,
      title: 'Kubernetes Security Deep Dive',
    }),
    href: '/admin/proposals/proposal-4',
  },
}

export const Rejected: Story = {
  args: {
    proposal: createMockProposal({
      status: Status.rejected,
      title: 'Basic Docker Introduction',
      level: Level.beginner,
    }),
    href: '/admin/proposals/proposal-5',
  },
}

export const Workshop: Story = {
  args: {
    proposal: createMockProposal({
      title: 'Hands-on Kubernetes Workshop',
      format: Format.workshop_120,
      audiences: [Audience.developer, Audience.devopsEngineer],
    }),
    href: '/admin/proposals/proposal-6',
  },
}

export const SingleSpeaker: Story = {
  args: {
    proposal: createMockProposal({
      speakers: [mockSpeakers[0]],
      title: 'Platform Engineering Best Practices',
    }),
    href: '/admin/proposals/proposal-7',
  },
}

export const Selected: Story = {
  args: {
    proposal: createMockProposal(),
    href: '/admin/proposals/proposal-1',
    isSelected: true,
    onSelect: () => console.log('Card selected'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Selected state with indigo highlight border.',
      },
    },
  },
}

export const AllStatuses: Story = {
  render: () => (
    <div className="space-y-4">
      <ProposalCard
        proposal={createMockProposal({
          _id: 'p1',
          status: Status.draft,
          title: 'Draft Proposal',
        })}
        href="#"
      />
      <ProposalCard
        proposal={createMockProposal({
          _id: 'p2',
          status: Status.submitted,
          title: 'Submitted Proposal',
        })}
        href="#"
      />
      <ProposalCard
        proposal={createMockProposal({
          _id: 'p3',
          status: Status.accepted,
          title: 'Accepted Proposal',
        })}
        href="#"
      />
      <ProposalCard
        proposal={createMockProposal({
          _id: 'p4',
          status: Status.confirmed,
          title: 'Confirmed Proposal',
        })}
        href="#"
      />
      <ProposalCard
        proposal={createMockProposal({
          _id: 'p5',
          status: Status.rejected,
          title: 'Rejected Proposal',
        })}
        href="#"
      />
      <ProposalCard
        proposal={createMockProposal({
          _id: 'p6',
          status: Status.withdrawn,
          title: 'Withdrawn Proposal',
        })}
        href="#"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All proposal statuses displayed together for comparison.',
      },
    },
  },
}
