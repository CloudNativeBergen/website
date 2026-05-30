import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalsList } from './ProposalsList'
import { Status, Format, Language, Level, Audience } from '@/lib/proposal/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { fn } from 'storybook/test'
import { Speaker } from '@/lib/speaker/types'

const mockProposals: ProposalExisting[] = [
  {
    _id: 'prop-1',
    _type: 'talk',
    _rev: '1',
    _createdAt: '2023-01-01T10:00:00Z',
    _updatedAt: '2023-01-01T10:00:00Z',
    title: 'How to Build a Cloud Native Future',
    description: [
      {
        _type: 'block',
        _key: 'desc1',
        children: [{ _type: 'span', text: 'A deep dive into cloud native.' }],
      },
    ],
    status: Status.submitted,
    format: Format.presentation_45,
    language: Language.english,
    level: Level.intermediate,
    audiences: [Audience.architect, Audience.developer],
    outline: 'Outline here...',
    tos: true,
    speakers: [
      {
        _id: 'speaker-prop-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        _type: 'speaker',
        _rev: '1',
        _createdAt: '2023-01-01T10:00:00Z',
        _updatedAt: '2023-01-01T10:00:00Z',
      } as Speaker,
    ],
    conference: { _type: 'reference', _ref: 'conf-2026' },
  },
  {
    _id: 'prop-2',
    _type: 'talk',
    _rev: '1',
    _createdAt: '2023-01-02T10:00:00Z',
    _updatedAt: '2023-01-02T10:00:00Z',
    title: 'Kubernetes Cost Optimization',
    description: [
      {
        _type: 'block',
        _key: 'desc2',
        children: [{ _type: 'span', text: 'Saving money in the cloud.' }],
      },
    ],
    status: Status.accepted,
    format: Format.lightning_10,
    language: Language.norwegian,
    level: Level.beginner,
    audiences: [Audience.manager, Audience.operator],
    outline: 'Outline here...',
    tos: true,
    speakers: [
      {
        _id: 'speaker-prop-2',
        name: 'John Smith',
        email: 'john@example.com',
        _type: 'speaker',
        _rev: '1',
        _createdAt: '2023-01-01T10:00:00Z',
        _updatedAt: '2023-01-01T10:00:00Z',
      } as Speaker,
    ],
    conference: { _type: 'reference', _ref: 'conf-2026' },
  },
]

function createMockProposal(
  id: string,
  title: string,
  status: Status,
  format: Format,
  speakerName: string,
): ProposalExisting {
  return {
    _id: id,
    _type: 'talk',
    _rev: '1',
    _createdAt: '2023-01-01T10:00:00Z',
    _updatedAt: '2023-01-01T10:00:00Z',
    title,
    description: [],
    status,
    format,
    language: Language.english,
    level: Level.intermediate,
    audiences: [],
    outline: '',
    tos: true,
    speakers: [
      {
        _id: `speaker-${id}`,
        name: speakerName,
        email: 'test@example.com',
        _type: 'speaker',
        _rev: '1',
        _createdAt: '2023-01-01T10:00:00Z',
        _updatedAt: '2023-01-01T10:00:00Z',
      } as Speaker,
    ],
    conference: { _type: 'reference', _ref: 'conf-1' },
  }
}

const meta = {
  title: 'Systems/Proposals/ProposalsList',
  component: ProposalsList,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ProposalsList>

export default meta
type Story = StoryObj<typeof ProposalsList>

export const Default: Story = {
  args: {
    initialProposals: mockProposals,
  },
}

export const WithPreviewEnabled: Story = {
  args: {
    initialProposals: mockProposals,
    enablePreview: true,
    onProposalSelect: fn(),
    selectedProposalId: 'prop-2',
  },
}

export const WithCurrentUser: Story = {
  args: {
    initialProposals: mockProposals,
    currentUserId: 'speaker-prop-1',
  },
}

export const WithCreateButton: Story = {
  args: {
    initialProposals: mockProposals,
    onCreateProposal: fn(),
  },
}

export const EmptyList: Story = {
  args: {
    initialProposals: [],
  },
}

export const SingleProposal: Story = {
  args: {
    initialProposals: [mockProposals[0]],
  },
}

export const OnlySubmitted: Story = {
  args: {
    initialProposals: mockProposals.filter(
      (p) => p.status === Status.submitted,
    ),
  },
}

export const MixedStatus: Story = {
  args: {
    initialProposals: [
      createMockProposal(
        'p1',
        'Draft Proposal',
        Status.draft,
        Format.presentation_25,
        'Alice',
      ),
      createMockProposal(
        'p2',
        'Submitted Talk',
        Status.submitted,
        Format.presentation_45,
        'Bob',
      ),
      createMockProposal(
        'p3',
        'Accepted Workshop',
        Status.accepted,
        Format.workshop_120,
        'Charlie',
      ),
      createMockProposal(
        'p4',
        'Rejected Lightning',
        Status.rejected,
        Format.lightning_10,
        'David',
      ),
      createMockProposal(
        'p5',
        'Waitlisted Talk',
        Status.waitlisted,
        Format.presentation_40,
        'Eve',
      ),
      createMockProposal(
        'p6',
        'Confirmed Workshop',
        Status.confirmed,
        Format.workshop_240,
        'Frank',
      ),
    ],
  },
}
