import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CompactProposalList } from './CompactProposalList'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { Flags, Speaker } from '@/lib/speaker/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { expect, within } from 'storybook/test'

const mockSpeakers: Speaker[] = [
  {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    slug: 'alice-johnson',
    title: 'Senior Engineer',
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
    title: 'DevOps Lead',
    flags: [Flags.firstTimeSpeaker],
  },
]

const createMockProposal = (
  id: string,
  title: string,
  status: Status,
  format: Format = Format.presentation_45,
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting => ({
  _id: id,
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title,
  description: convertStringToPortableTextBlocks('Test description'),
  language: Language.english,
  format,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status,
  outline: '',
  topics: [],
  tos: true,
  speakers: [mockSpeakers[0]],
  conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
  ...overrides,
})

const mixedStatusProposals: ProposalExisting[] = [
  createMockProposal(
    'talk-1',
    'Building Scalable Microservices with Kubernetes',
    Status.confirmed,
  ),
  createMockProposal(
    'talk-2',
    'Introduction to GitOps',
    Status.accepted,
    Format.lightning_10,
  ),
  createMockProposal(
    'talk-3',
    'Advanced CI/CD Patterns',
    Status.submitted,
    Format.presentation_20,
  ),
  createMockProposal(
    'talk-4',
    'Cloud Native CI/CD Pipelines',
    Status.waitlisted,
    Format.presentation_25,
  ),
  createMockProposal(
    'talk-5',
    'Service Mesh Deep Dive',
    Status.rejected,
    Format.presentation_45,
  ),
]

const allSubmittedProposals: ProposalExisting[] = [
  createMockProposal(
    'talk-1',
    'Cloud Native Security Best Practices',
    Status.submitted,
  ),
  createMockProposal(
    'talk-2',
    'Observability for Kubernetes',
    Status.submitted,
    Format.lightning_10,
  ),
  createMockProposal(
    'talk-3',
    'Hands-on Helm Workshop',
    Status.submitted,
    Format.workshop_120,
  ),
]

const meta = {
  title: 'Systems/Proposals/CompactProposalList',
  component: CompactProposalList,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A compact list of proposals showing title, format icon, speaker avatars, status badge, and optional indicators for video, feedback, and missing attachments. Sorted by status priority (confirmed → accepted → submitted → draft → rejected → withdrawn).',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompactProposalList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    proposals: mixedStatusProposals,
    canEdit: true,
  },
}

export const ReadOnly: Story = {
  args: {
    proposals: mixedStatusProposals,
    canEdit: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Without edit capability - no pencil icon shown.',
      },
    },
  },
}

export const AllSubmitted: Story = {
  args: {
    proposals: allSubmittedProposals,
    canEdit: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'All proposals in submitted status awaiting review.',
      },
    },
  },
}

export const AllRejected: Story = {
  args: {
    proposals: [
      createMockProposal('talk-1', 'Proposal One', Status.rejected),
      createMockProposal('talk-2', 'Proposal Two', Status.rejected),
      createMockProposal('talk-3', 'Proposal Three', Status.withdrawn),
    ],
    canEdit: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'All proposals rejected/withdrawn - shows red badges without approved talk context.',
      },
    },
  },
}

export const WithApprovedAndRejected: Story = {
  args: {
    proposals: [
      createMockProposal('talk-1', 'Accepted Talk', Status.confirmed),
      createMockProposal('talk-2', 'Another Proposal', Status.rejected),
      createMockProposal('talk-3', 'Third Proposal', Status.submitted),
    ],
    canEdit: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'When speaker has an approved talk, rejected ones show "Not selected" with muted styling.',
      },
    },
  },
}

export const SingleProposal: Story = {
  args: {
    proposals: [
      createMockProposal(
        'talk-1',
        'My Conference Talk',
        Status.submitted,
        Format.presentation_45,
      ),
    ],
    canEdit: true,
  },
}

export const WithVideo: Story = {
  args: {
    proposals: [
      createMockProposal(
        'talk-1',
        'Talk with Video Recording',
        Status.confirmed,
        Format.presentation_45,
        {
          attachments: [
            {
              _key: 'video-1',
              _type: 'urlAttachment',
              attachmentType: 'recording',
              url: 'https://youtube.com/watch?v=abc123',
            },
          ],
        },
      ),
    ],
    canEdit: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Proposal with video recording shows purple Video badge.',
      },
    },
  },
}

export const RendersAllStatusBadges: Story = {
  args: {
    proposals: mixedStatusProposals,
    canEdit: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Confirmed')).toBeInTheDocument()
    expect(canvas.getByText('Accepted')).toBeInTheDocument()
    expect(canvas.getByText('Submitted')).toBeInTheDocument()
    expect(canvas.getByText('Waitlisted')).toBeInTheDocument()
    // When an approved talk exists, rejected shows "Not selected"
    expect(canvas.getByText('Not selected')).toBeInTheDocument()
  },
}

export const SortsByStatusPriority: Story = {
  args: {
    proposals: [
      createMockProposal('talk-1', 'Rejected Talk', Status.rejected),
      createMockProposal('talk-2', 'Confirmed Talk', Status.confirmed),
      createMockProposal('talk-3', 'Submitted Talk', Status.submitted),
    ],
    canEdit: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const links = canvas.getAllByRole('link', {
      name: /Talk$/,
    })
    // Confirmed should be first, Submitted second, Rejected last
    expect(links[0]).toHaveTextContent('Confirmed Talk')
    expect(links[1]).toHaveTextContent('Submitted Talk')
    expect(links[2]).toHaveTextContent('Rejected Talk')
  },
}

export const EditableShowsEditLinks: Story = {
  args: {
    proposals: [createMockProposal('talk-1', 'My Talk', Status.submitted)],
    canEdit: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const editLink = canvas.getByTitle('Edit proposal')
    expect(editLink).toBeInTheDocument()
    expect(editLink).toHaveAttribute(
      'href',
      expect.stringContaining('/cfp/proposal?id=talk-1'),
    )
  },
}

export const ReadOnlyHidesEditLinks: Story = {
  args: {
    proposals: [createMockProposal('talk-1', 'My Talk', Status.submitted)],
    canEdit: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByTitle('Edit proposal')).not.toBeInTheDocument()
  },
}

export const RejectedShowsNotSelectedWithApprovedTalk: Story = {
  args: {
    proposals: [
      createMockProposal('talk-1', 'Accepted Talk', Status.confirmed),
      createMockProposal('talk-2', 'Other Proposal', Status.rejected),
    ],
    canEdit: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // When speaker has an approved talk, rejected shows "Not selected"
    expect(canvas.getByText('Not selected')).toBeInTheDocument()
    expect(canvas.queryByText('Rejected')).not.toBeInTheDocument()
  },
}

export const WithdrawnStatusRendered: Story = {
  args: {
    proposals: [
      createMockProposal('talk-1', 'Withdrawn Talk', Status.withdrawn),
      createMockProposal('talk-2', 'Active Talk', Status.submitted),
    ],
    canEdit: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Withdrawn')).toBeInTheDocument()
    expect(canvas.getByText('Submitted')).toBeInTheDocument()
  },
}

export const ShowsProposalCount: Story = {
  args: {
    proposals: allSubmittedProposals,
    canEdit: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Proposals (3)')).toBeInTheDocument()
  },
}

export const ConferenceEnded: Story = {
  args: {
    proposals: [
      createMockProposal(
        'talk-1',
        'Past Conference Talk',
        Status.confirmed,
        Format.presentation_45,
        {
          audienceFeedback: {
            greenCount: 42,
            yellowCount: 15,
            redCount: 3,
          },
        },
      ),
      createMockProposal(
        'talk-2',
        'Talk Without Slides',
        Status.accepted,
        Format.lightning_10,
      ),
    ],
    canEdit: false,
    conferenceHasEnded: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'After conference ends: shows audience feedback count and warning for missing slides.',
      },
    },
  },
}

export const MultiSpeaker: Story = {
  args: {
    proposals: [
      createMockProposal(
        'talk-1',
        'Joint Presentation on Platform Engineering',
        Status.confirmed,
        Format.presentation_45,
        {
          speakers: mockSpeakers,
        },
      ),
    ],
    canEdit: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Proposal with multiple speakers shows stacked avatars.',
      },
    },
  },
}

export const Empty: Story = {
  args: {
    proposals: [],
    canEdit: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Empty state when speaker has no proposals.',
      },
    },
  },
}

export const DraftProposals: Story = {
  args: {
    proposals: [
      createMockProposal('talk-1', 'Draft Talk Idea', Status.draft),
      createMockProposal(
        'talk-2',
        'Another Work in Progress',
        Status.draft,
        Format.workshop_120,
      ),
    ],
    canEdit: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Proposals in draft status not yet submitted.',
      },
    },
  },
}
