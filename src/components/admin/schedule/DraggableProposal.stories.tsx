import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DndContext } from '@dnd-kit/core'
import { DraggableProposal } from './DraggableProposal'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { Topic } from '@/lib/topic/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

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
    title: 'DevOps',
    color: '#FF6B35',
    slug: { current: 'devops' },
  },
]

const createMockProposal = (
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting => ({
  _id: 'proposal-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-11-15T10:30:00Z',
  _updatedAt: '2024-11-20T14:45:00Z',
  title: 'Building Scalable Kubernetes Applications',
  description: convertStringToPortableTextBlocks(
    'A talk about scaling Kubernetes.',
  ),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.operator],
  status: Status.confirmed,
  outline: '',
  topics: mockTopics,
  tos: true,
  speakers: [
    {
      _id: 'speaker-1',
      _rev: '1',
      _createdAt: '2024-01-01T00:00:00Z',
      _updatedAt: '2024-01-01T00:00:00Z',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      slug: 'alice-johnson',
    },
  ],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
  ...overrides,
})

const meta: Meta<typeof DraggableProposal> = {
  title: 'Systems/Program/Admin/DraggableProposal',
  component: DraggableProposal,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A draggable proposal card used in the schedule editor. Displays title, speaker, duration, level indicator, audience badges, and topic color markers. Visual size scales with talk duration. Shows warning indicators for accepted-but-not-confirmed and withdrawn/rejected proposals.',
      },
    },
  },
  decorators: [
    (Story) => (
      <DndContext>
        <div className="w-80 p-4">
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof DraggableProposal>

export const Presentation45: Story = {
  args: {
    proposal: createMockProposal(),
  },
}

export const LightningTalk: Story = {
  args: {
    proposal: createMockProposal({
      _id: 'proposal-lightning',
      title: 'Quick Tips for kubectl',
      format: Format.lightning_10,
      level: Level.beginner,
      audiences: [Audience.developer],
      topics: [mockTopics[0]],
    }),
  },
}

export const Presentation25: Story = {
  args: {
    proposal: createMockProposal({
      _id: 'proposal-25',
      title: 'GitOps Best Practices for Platform Teams',
      format: Format.presentation_25,
      level: Level.advanced,
      audiences: [Audience.operator, Audience.architect],
    }),
  },
}

export const Workshop: Story = {
  args: {
    proposal: createMockProposal({
      _id: 'proposal-workshop',
      title: 'Hands-on Kubernetes Security Workshop',
      format: Format.workshop_120,
      level: Level.advanced,
      audiences: [Audience.securityEngineer],
      topics: [
        {
          _id: 'topic-sec',
          _type: 'topic',
          title: 'Security',
          color: '#E63946',
          slug: { current: 'security' },
        },
      ],
    }),
  },
}

export const AcceptedNotConfirmed: Story = {
  args: {
    proposal: createMockProposal({
      _id: 'proposal-accepted',
      status: Status.accepted,
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows amber border and warning icon for proposals accepted but not yet confirmed by the speaker.',
      },
    },
  },
}

export const WithdrawnProposal: Story = {
  args: {
    proposal: createMockProposal({
      _id: 'proposal-withdrawn',
      status: Status.withdrawn,
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows red border and warning icon for withdrawn or rejected proposals.',
      },
    },
  },
}

export const NoTopics: Story = {
  args: {
    proposal: createMockProposal({
      _id: 'proposal-no-topics',
      title: 'A Talk Without Topic Tags',
      topics: [],
      audiences: [],
    }),
  },
}

export const Dragging: Story = {
  args: {
    proposal: createMockProposal(),
    isDragging: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Reduced opacity state shown while the card is being dragged.',
      },
    },
  },
}
