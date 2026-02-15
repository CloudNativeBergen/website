import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalStatistics } from './ProposalStatistics'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

import { Topic } from '@/lib/topic/types'

const mockTopics: Topic[] = [
  {
    _id: 'topic-1',
    _type: 'topic',
    title: 'Kubernetes',
    color: '326CE5',
    slug: { current: 'kubernetes' },
  },
  {
    _id: 'topic-2',
    _type: 'topic',
    title: 'DevOps',
    color: 'FF6B35',
    slug: { current: 'devops' },
  },
  {
    _id: 'topic-3',
    _type: 'topic',
    title: 'AI/ML',
    color: '4CAF50',
    slug: { current: 'ai-ml' },
  },
  {
    _id: 'topic-4',
    _type: 'topic',
    title: 'Security',
    color: 'E91E63',
    slug: { current: 'security' },
  },
  {
    _id: 'topic-5',
    _type: 'topic',
    title: 'Observability',
    color: '9C27B0',
    slug: { current: 'observability' },
  },
]

const createMockProposal = (
  id: string,
  level: Level,
  audiences: Audience[],
  topics: typeof mockTopics,
): ProposalExisting => ({
  _id: id,
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: `Proposal ${id}`,
  description: convertStringToPortableTextBlocks('Description'),
  language: Language.english,
  format: Format.presentation_45,
  level,
  audiences,
  status: Status.submitted,
  outline: '',
  topics,
  tos: true,
  conference: { _type: 'reference', _ref: 'conf-1' },
})

const mockProposals: ProposalExisting[] = [
  createMockProposal(
    '1',
    Level.beginner,
    [Audience.developer],
    [mockTopics[0]],
  ),
  createMockProposal(
    '2',
    Level.beginner,
    [Audience.developer, Audience.devopsEngineer],
    [mockTopics[0], mockTopics[1]],
  ),
  createMockProposal(
    '3',
    Level.intermediate,
    [Audience.developer],
    [mockTopics[0]],
  ),
  createMockProposal(
    '4',
    Level.intermediate,
    [Audience.architect],
    [mockTopics[1]],
  ),
  createMockProposal(
    '5',
    Level.intermediate,
    [Audience.operator, Audience.devopsEngineer],
    [mockTopics[1], mockTopics[4]],
  ),
  createMockProposal(
    '6',
    Level.advanced,
    [Audience.architect, Audience.securityEngineer],
    [mockTopics[3]],
  ),
  createMockProposal(
    '7',
    Level.advanced,
    [Audience.dataEngineer],
    [mockTopics[2]],
  ),
  createMockProposal(
    '8',
    Level.advanced,
    [Audience.developer, Audience.architect],
    [mockTopics[2], mockTopics[3]],
  ),
  createMockProposal(
    '9',
    Level.intermediate,
    [Audience.devopsEngineer],
    [mockTopics[4]],
  ),
  createMockProposal(
    '10',
    Level.beginner,
    [Audience.developer, Audience.qaEngineer],
    [mockTopics[0], mockTopics[4]],
  ),
]

const meta: Meta<typeof ProposalStatistics> = {
  title: 'Systems/Proposals/Admin/ProposalStatistics',
  component: ProposalStatistics,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collapsible statistics panel showing proposal distribution by level, topic, and audience. Uses colored progress bars that match topic colors from Sanity.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof ProposalStatistics>

export const Default: Story = {
  args: {
    proposals: mockProposals,
  },
}

export const Expanded: Story = {
  args: {
    proposals: mockProposals,
  },
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('button')
    if (button) {
      button.click()
    }
  },
  parameters: {
    docs: {
      description: {
        story: 'Statistics panel in expanded state showing all distributions.',
      },
    },
  },
}

export const FewProposals: Story = {
  args: {
    proposals: mockProposals.slice(0, 3),
  },
  parameters: {
    docs: {
      description: {
        story: 'With only a few proposals, showing limited distribution.',
      },
    },
  },
}

export const SingleProposal: Story = {
  args: {
    proposals: [mockProposals[0]],
  },
}

export const Empty: Story = {
  args: {
    proposals: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'With no proposals, the component renders nothing.',
      },
    },
  },
}

export const ManyTopics: Story = {
  args: {
    proposals: [
      ...mockProposals,
      createMockProposal(
        '11',
        Level.beginner,
        [Audience.developer],
        [mockTopics[0], mockTopics[1], mockTopics[2]],
      ),
      createMockProposal(
        '12',
        Level.intermediate,
        [Audience.architect],
        [mockTopics[3], mockTopics[4]],
      ),
      createMockProposal(
        '13',
        Level.advanced,
        [Audience.securityEngineer],
        [mockTopics[3]],
      ),
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'With many proposals across multiple topics showing diverse distribution.',
      },
    },
  },
}
