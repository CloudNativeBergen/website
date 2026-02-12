import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalPreview } from './ProposalPreview'
import { fn } from 'storybook/test'
import {
  ProposalExisting,
  Status,
  Format,
  Language,
  Level,
  Audience,
} from '@/lib/proposal/types'
import { Speaker, Flags } from '@/lib/speaker/types'
import { Review } from '@/lib/review/types'
import { Topic } from '@/lib/topic/types'

const createMockSpeaker = (
  id: string,
  name: string,
  flags?: Flags[],
): Speaker =>
  ({
    _id: id,
    _rev: 'rev1',
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-01T00:00:00Z',
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    title: 'Platform Engineer at TechCorp',
    flags,
  }) as Speaker

const createMockReview = (
  id: string,
  score: { content: number; relevance: number; speaker: number },
): Review => ({
  _id: id,
  _rev: 'rev1',
  _createdAt: '2025-01-15T10:00:00Z',
  _updatedAt: '2025-01-15T10:00:00Z',
  comment: 'Good proposal.',
  score,
  reviewer: { _ref: 'reviewer-1', _type: 'reference' },
  proposal: { _ref: 'proposal-1', _type: 'reference' },
})

const mockTopics: Topic[] = [
  {
    _id: 'topic-1',
    _type: 'topic',
    title: 'Kubernetes',
    color: '#326CE5',
    slug: { current: 'kubernetes' },
  },
  {
    _id: 'topic-2',
    _type: 'topic',
    title: 'Observability',
    color: '#FFE66D',
    slug: { current: 'observability' },
  },
]

const createMockProposal = (
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting => ({
  _id: 'proposal-1',
  _rev: 'rev1',
  _type: 'proposal',
  _createdAt: '2025-01-15T10:00:00Z',
  _updatedAt: '2025-01-15T10:00:00Z',
  title: 'Building Production-Ready Kubernetes Operators',
  description: [
    {
      _type: 'block',
      _key: 'block1',
      style: 'normal',
      markDefs: [],
      children: [
        {
          _type: 'span',
          _key: 'span1',
          text: 'Learn how to build robust Kubernetes operators using the Operator SDK. This talk covers best practices, testing strategies, and deployment patterns.',
          marks: [],
        },
      ],
    },
  ],
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.architect],
  outline: 'Detailed outline for the talk',
  tos: true,
  status: Status.submitted,
  speakers: [createMockSpeaker('speaker-1', 'Anna Hansen')],
  conference: { _ref: 'conf-2025', _type: 'reference' },
  topics: mockTopics,
  ...overrides,
})

const meta: Meta<typeof ProposalPreview> = {
  title: 'Systems/Proposals/Admin/ProposalPreview',
  component: ProposalPreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A slide-out preview panel showing proposal details. Displays speaker info, talk metadata, description, and review summary if available.',
      },
    },
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-screen w-96 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalPreview>

export const Default: Story = {
  args: {
    proposal: createMockProposal(),
    onClose: fn(),
  },
}

export const WithReviews: Story = {
  args: {
    proposal: createMockProposal({
      reviews: [
        createMockReview('review-1', { content: 5, relevance: 4, speaker: 5 }),
        createMockReview('review-2', { content: 4, relevance: 5, speaker: 4 }),
        createMockReview('review-3', { content: 4, relevance: 4, speaker: 3 }),
      ],
    }),
    onClose: fn(),
  },
}

export const AcceptedStatus: Story = {
  args: {
    proposal: createMockProposal({ status: Status.accepted }),
    onClose: fn(),
  },
}

export const ConfirmedStatus: Story = {
  args: {
    proposal: createMockProposal({ status: Status.confirmed }),
    onClose: fn(),
  },
}

export const RejectedStatus: Story = {
  args: {
    proposal: createMockProposal({ status: Status.rejected }),
    onClose: fn(),
  },
}

export const LightningTalk: Story = {
  args: {
    proposal: createMockProposal({
      title: 'Quick Tips for Better Kubernetes Manifests',
      format: Format.lightning_10,
    }),
    onClose: fn(),
  },
}

export const Workshop: Story = {
  args: {
    proposal: createMockProposal({
      title: 'Hands-On Kubernetes Security Workshop',
      format: Format.workshop_120,
      level: Level.advanced,
    }),
    onClose: fn(),
  },
}

export const MultipleSpeakers: Story = {
  args: {
    proposal: createMockProposal({
      speakers: [
        createMockSpeaker('speaker-1', 'Anna Hansen'),
        createMockSpeaker('speaker-2', 'Erik Larsen'),
      ],
    }),
    onClose: fn(),
  },
}

export const RequiresTravelFunding: Story = {
  args: {
    proposal: createMockProposal({
      speakers: [
        createMockSpeaker('speaker-1', 'International Speaker', [
          Flags.requiresTravelFunding,
        ]),
      ],
    }),
    onClose: fn(),
  },
}

export const NoTopics: Story = {
  args: {
    proposal: createMockProposal({ topics: [] }),
    onClose: fn(),
  },
}

export const NoSpeakers: Story = {
  args: {
    proposal: createMockProposal({ speakers: [] }),
    onClose: fn(),
  },
}
