import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DndContext } from '@dnd-kit/core'
import { UnassignedProposals } from './UnassignedProposals'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

const createMockProposal = (
  overrides: Partial<ProposalExisting> & { _id: string },
): ProposalExisting => ({
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-11-15T10:30:00Z',
  _updatedAt: '2024-11-20T14:45:00Z',
  title: 'Untitled Talk',
  description: convertStringToPortableTextBlocks('A talk description.'),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.confirmed,
  outline: '',
  topics: [],
  tos: true,
  speakers: [
    {
      _id: 'speaker-1',
      _rev: '1',
      _createdAt: '2024-01-01T00:00:00Z',
      _updatedAt: '2024-01-01T00:00:00Z',
      name: 'Jane Doe',
      email: 'jane@example.com',
      slug: 'jane-doe',
    },
  ],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
  ...overrides,
})

const mockProposals: ProposalExisting[] = [
  createMockProposal({
    _id: 'proposal-1',
    title: 'Building Scalable Kubernetes Applications',
    format: Format.presentation_45,
    level: Level.intermediate,
    audiences: [Audience.developer, Audience.architect],
    topics: [
      {
        _id: 't1',
        _type: 'topic',
        title: 'Kubernetes',
        color: '#326CE5',
        slug: { current: 'kubernetes' },
      },
    ],
    speakers: [
      {
        _id: 's1',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        slug: 'alice-johnson',
      },
    ],
  }),
  createMockProposal({
    _id: 'proposal-2',
    title: 'Service Mesh Deep Dive with Istio',
    format: Format.presentation_25,
    level: Level.advanced,
    audiences: [Audience.developer],
    topics: [
      {
        _id: 't2',
        _type: 'topic',
        title: 'Service Mesh',
        color: '#466BB0',
        slug: { current: 'service-mesh' },
      },
      {
        _id: 't1',
        _type: 'topic',
        title: 'Kubernetes',
        color: '#326CE5',
        slug: { current: 'kubernetes' },
      },
    ],
    speakers: [
      {
        _id: 's2',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Bob Smith',
        email: 'bob@example.com',
        slug: 'bob-smith',
      },
    ],
  }),
  createMockProposal({
    _id: 'proposal-3',
    title: 'Cloud Native CI/CD Pipelines',
    format: Format.lightning_10,
    level: Level.beginner,
    audiences: [Audience.developer],
    topics: [
      {
        _id: 't3',
        _type: 'topic',
        title: 'CI/CD',
        color: '#F97316',
        slug: { current: 'cicd' },
      },
    ],
    speakers: [
      {
        _id: 's3',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Carol White',
        email: 'carol@example.com',
        slug: 'carol-white',
      },
    ],
  }),
  createMockProposal({
    _id: 'proposal-4',
    title: 'Hands-on Kubernetes Security Workshop',
    format: Format.workshop_120,
    level: Level.advanced,
    audiences: [Audience.developer, Audience.securityEngineer],
    topics: [
      {
        _id: 't1',
        _type: 'topic',
        title: 'Kubernetes',
        color: '#326CE5',
        slug: { current: 'kubernetes' },
      },
      {
        _id: 't4',
        _type: 'topic',
        title: 'Security',
        color: '#EF4444',
        slug: { current: 'security' },
      },
    ],
    speakers: [
      {
        _id: 's4',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Dave Chen',
        email: 'dave@example.com',
        slug: 'dave-chen',
      },
    ],
  }),
  createMockProposal({
    _id: 'proposal-5',
    title: 'Observability Best Practices with OpenTelemetry',
    format: Format.presentation_45,
    level: Level.intermediate,
    audiences: [Audience.developer, Audience.architect],
    topics: [
      {
        _id: 't5',
        _type: 'topic',
        title: 'Observability',
        color: '#8B5CF6',
        slug: { current: 'observability' },
      },
    ],
    speakers: [
      {
        _id: 's5',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Eve Martinez',
        email: 'eve@example.com',
        slug: 'eve-martinez',
      },
    ],
  }),
  createMockProposal({
    _id: 'proposal-6',
    title: 'Platform Engineering 101',
    format: Format.presentation_25,
    level: Level.beginner,
    audiences: [Audience.manager],
    topics: [
      {
        _id: 't6',
        _type: 'topic',
        title: 'Platform Engineering',
        color: '#10B981',
        slug: { current: 'platform-engineering' },
      },
    ],
    status: Status.accepted,
    speakers: [
      {
        _id: 's6',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Frank Lee',
        email: 'frank@example.com',
        slug: 'frank-lee',
      },
    ],
  }),
]

const meta: Meta<typeof UnassignedProposals> = {
  title: 'Systems/Program/Admin/UnassignedProposals',
  component: UnassignedProposals,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Sidebar panel displaying unassigned proposals that can be dragged onto the schedule. Features search, format/level filtering, virtual scrolling for large lists, and a legend explaining visual indicators.',
      },
    },
  },
  decorators: [
    (Story) => (
      <DndContext>
        <div className="flex h-screen">
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof UnassignedProposals>

export const WithProposals: Story = {
  args: {
    proposals: mockProposals,
  },
}

export const Empty: Story = {
  args: {
    proposals: [],
  },
}

export const SingleProposal: Story = {
  args: {
    proposals: [mockProposals[0]],
  },
}

export const MixedStatuses: Story = {
  args: {
    proposals: mockProposals,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows proposals with mixed statuses: some confirmed (solid border) and some accepted but not yet confirmed (amber border).',
      },
    },
  },
}
