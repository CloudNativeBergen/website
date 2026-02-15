import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalsList } from './ProposalsList'
import { fn } from 'storybook/test'
import {
  ProposalExisting,
  Status,
  Format,
  Language,
  Level,
} from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'

const createMockSpeaker = (id: string, name: string): Speaker =>
  ({
    _id: id,
    _rev: 'rev1',
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-01T00:00:00Z',
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
  }) as Speaker

const createMockProposal = (
  id: string,
  title: string,
  status: Status,
  format: Format,
  speakerName: string,
): ProposalExisting => ({
  _id: id,
  _rev: 'rev1',
  _type: 'proposal',
  _createdAt: '2025-01-15T10:00:00Z',
  _updatedAt: '2025-01-15T10:00:00Z',
  title,
  description: [],
  language: Language.english,
  format,
  level: Level.intermediate,
  audiences: [],
  outline: 'Outline for the talk',
  tos: true,
  status,
  speakers: [createMockSpeaker(`speaker-${id}`, speakerName)],
  conference: { _ref: 'conf-2025', _type: 'reference' },
})

const mockProposals: ProposalExisting[] = [
  createMockProposal(
    'prop-1',
    'Building Kubernetes Operators',
    Status.submitted,
    Format.presentation_45,
    'Anna Hansen',
  ),
  createMockProposal(
    'prop-2',
    'Observability at Scale',
    Status.accepted,
    Format.presentation_25,
    'Erik Larsen',
  ),
  createMockProposal(
    'prop-3',
    'GitOps Best Practices',
    Status.confirmed,
    Format.presentation_45,
    'Sofia Berg',
  ),
  createMockProposal(
    'prop-4',
    'Lightning Talk: Quick Tips',
    Status.submitted,
    Format.lightning_10,
    'Magnus Olsen',
  ),
  createMockProposal(
    'prop-5',
    'Advanced Workshop',
    Status.draft,
    Format.workshop_120,
    'Ingrid Nilsen',
  ),
]

const meta: Meta<typeof ProposalsList> = {
  title: 'Systems/Proposals/Admin/ProposalsList',
  component: ProposalsList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Main admin view for managing conference proposals. Displays a filterable grid of proposal cards with statistics and status indicators.',
      },
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/admin/proposals',
        query: {},
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalsList>

export const Default: Story = {
  args: {
    proposals: mockProposals,
  },
}

export const WithPreviewEnabled: Story = {
  args: {
    proposals: mockProposals,
    enablePreview: true,
    onProposalSelect: fn(),
    selectedProposalId: 'prop-2',
  },
}

export const WithCurrentUser: Story = {
  args: {
    proposals: mockProposals,
    currentUserId: 'speaker-prop-1',
  },
}

export const WithCreateButton: Story = {
  args: {
    proposals: mockProposals,
    onCreateProposal: fn(),
  },
}

export const EmptyList: Story = {
  args: {
    proposals: [],
  },
}

export const SingleProposal: Story = {
  args: {
    proposals: [mockProposals[0]],
  },
}

export const SubmittedOnly: Story = {
  args: {
    proposals: mockProposals.filter((p) => p.status === Status.submitted),
  },
}

export const AllStatuses: Story = {
  args: {
    proposals: [
      createMockProposal(
        'p1',
        'Draft Proposal',
        Status.draft,
        Format.presentation_25,
        'Speaker 1',
      ),
      createMockProposal(
        'p2',
        'Submitted Proposal',
        Status.submitted,
        Format.presentation_25,
        'Speaker 2',
      ),
      createMockProposal(
        'p3',
        'Accepted Proposal',
        Status.accepted,
        Format.presentation_45,
        'Speaker 3',
      ),
      createMockProposal(
        'p4',
        'Confirmed Proposal',
        Status.confirmed,
        Format.presentation_45,
        'Speaker 4',
      ),
      createMockProposal(
        'p5',
        'Rejected Proposal',
        Status.rejected,
        Format.lightning_10,
        'Speaker 5',
      ),
      createMockProposal(
        'p6',
        'Withdrawn Proposal',
        Status.withdrawn,
        Format.workshop_120,
        'Speaker 6',
      ),
    ],
  },
}
