import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SpeakerTable } from './SpeakerTable'
import { Speaker, Flags } from '@/lib/speaker/types'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

interface SpeakerWithProposals extends Speaker {
  proposals: ProposalExisting[]
}

const mockTopic = { _type: 'reference' as const, _ref: 'topic-1' }

const mockProposal = (
  id: string,
  title: string,
  status: Status,
  format: Format = Format.presentation_45,
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
  topics: [mockTopic],
  tos: true,
  speakers: [],
  conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
})

const mockSpeakers: SpeakerWithProposals[] = [
  {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    slug: 'alice-johnson',
    title: 'Senior Platform Engineer at Google',
    flags: [Flags.localSpeaker],
    links: [
      'https://linkedin.com/in/alicejohnson',
      'https://bsky.app/profile/alice.dev',
    ],
    proposals: [
      mockProposal(
        'talk-1',
        'Building Scalable Microservices with Kubernetes',
        Status.confirmed,
      ),
    ],
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
    flags: [Flags.firstTimeSpeaker, Flags.diverseSpeaker],
    links: ['https://linkedin.com/in/bobsmith'],
    proposals: [
      mockProposal('talk-2', 'GitOps for the Enterprise', Status.accepted),
      mockProposal(
        'talk-3',
        'Advanced CI/CD Patterns',
        Status.submitted,
        Format.lightning_10,
      ),
    ],
  },
  {
    _id: 'speaker-3',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Carol Williams',
    email: 'carol@cloudprovider.io',
    slug: 'carol-williams',
    title: 'Principal Solutions Architect, AWS',
    flags: [Flags.requiresTravelFunding],
    links: ['https://bsky.app/profile/carol.codes'],
    proposals: [
      mockProposal(
        'talk-4',
        'Hands-on Kubernetes Workshop',
        Status.confirmed,
        Format.workshop_120,
      ),
    ],
  },
  {
    _id: 'speaker-4',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'David Chen',
    email: 'david@startup.io',
    slug: 'david-chen',
    title: 'CTO at CloudStartup',
    flags: [],
    links: [],
    proposals: [
      mockProposal(
        'talk-5',
        'From Zero to Production: A Startup Journey',
        Status.accepted,
      ),
    ],
  },
]

const meta = {
  title: 'Systems/Speakers/Admin/SpeakerTable',
  component: SpeakerTable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Admin table for managing speakers with accepted/confirmed talks. Features search, filtering by status and speaker flags, configurable column visibility, and action menus for editing and previewing speaker profiles.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpeakerTable>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    speakers: mockSpeakers,
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
}

export const Empty: Story = {
  args: {
    speakers: [],
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows empty state when no speakers with accepted talks exist.',
      },
    },
  },
}

export const SingleSpeaker: Story = {
  args: {
    speakers: [mockSpeakers[0]],
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
}

export const ManySpeakers: Story = {
  args: {
    speakers: [
      ...mockSpeakers,
      {
        _id: 'speaker-5',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Eva Martinez',
        email: 'eva@tech.com',
        slug: 'eva-martinez',
        title: 'Staff Engineer at Netflix',
        flags: [Flags.localSpeaker, Flags.diverseSpeaker],
        links: ['https://linkedin.com/in/evamartinez'],
        proposals: [
          mockProposal('talk-6', 'Observability at Scale', Status.confirmed),
        ],
      },
      {
        _id: 'speaker-6',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Frank Thompson',
        email: 'frank@consultancy.com',
        slug: 'frank-thompson',
        title: 'Independent Consultant',
        flags: [Flags.firstTimeSpeaker, Flags.requiresTravelFunding],
        links: [],
        proposals: [
          mockProposal('talk-7', 'Service Mesh Deep Dive', Status.accepted),
        ],
      },
    ],
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Table with many speakers showing various flags and proposal statuses.',
      },
    },
  },
}

export const Mobile: Story = {
  args: {
    speakers: mockSpeakers,
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  parameters: {
    viewport: {
      viewports: {
        mobile360: {
          name: 'Mobile 360px',
          styles: { width: '360px', height: '740px' },
        },
      },
      defaultViewport: 'mobile360',
    },
    docs: {
      description: {
        story:
          'Below `md`, the wide speaker table collapses into a stacked card layout — no horizontal scroll on a phone. Each card shows the speaker name, title, indicators, email, and talks with status badges, plus the action menu.',
      },
    },
  },
}

export const WithoutConferenceFilter: Story = {
  args: {
    speakers: mockSpeakers,
    currentConferenceId: undefined,
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Without a currentConferenceId, all proposals from all conferences are shown.',
      },
    },
  },
}

/** All four ticket states side by side — the column and the mobile card. */
const ticketStatuses = {
  'speaker-1': { speakerId: 'speaker-1', state: 'redeemed' as const },
  'speaker-2': {
    speakerId: 'speaker-2',
    state: 'invited' as const,
    invitedAt: '2026-03-01T09:00:00Z',
  },
  'speaker-3': { speakerId: 'speaker-3', state: 'not-invited' as const },
  'speaker-4': { speakerId: 'speaker-4', state: 'unknown' as const },
}

export const TicketStatus: Story = {
  args: {
    speakers: mockSpeakers,
    currentConferenceId: 'conf-2025',
    ticketStatuses,
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Claimed, invited-but-unclaimed (with the send date), never invited, and unknown — the provider being unreachable, which is deliberately not the same as unclaimed.',
      },
    },
  },
}

/**
 * The per-speaker row action. "Not invited" offers "Send invitation" and
 * "Invited" offers "Send again"; "Claimed" and "Unknown" offer nothing — there
 * is nothing to do, and nothing we can tell, respectively.
 */
export const TicketStatusRowActions: Story = {
  args: {
    ...TicketStatus.args,
    onSendTicketInvitation: fn(),
  },
}

/**
 * The conference has no speaker invite link, so no row can send and the reason
 * takes the place of every action. In the table this is the column that has to
 * hold it — the text wraps rather than clipping.
 */
export const TicketStatusNoInviteLink: Story = {
  args: {
    ...TicketStatusRowActions.args,
    ticketActionsUnavailableReason:
      'No speaker invite link — add one under Settings',
  },
}

/** One row's invitation in flight. */
export const TicketStatusRowActionSending: Story = {
  args: {
    ...TicketStatusRowActions.args,
    sendingTicketSpeakerIds: new Set(['speaker-3']),
  },
}

export const TicketStatusRowActionsMobile: Story = {
  args: TicketStatusRowActions.args,
  parameters: {
    viewport: {
      viewports: {
        mobile360: {
          name: 'Mobile 360px',
          styles: { width: '360px', height: '740px' },
        },
      },
      defaultViewport: 'mobile360',
    },
  },
}

export const TicketStatusMobile: Story = {
  args: TicketStatus.args,
  parameters: {
    viewport: {
      viewports: {
        mobile360: {
          name: 'Mobile 360px',
          styles: { width: '360px', height: '740px' },
        },
      },
      defaultViewport: 'mobile360',
    },
  },
}

/**
 * The status read is in flight. The badges say "Checking…" rather than "-",
 * and with the "Ticket not claimed" filter on the toolbar says so instead of
 * rendering an empty list that reads as "nobody left to chase".
 */
export const TicketStatusLoading: Story = {
  args: {
    speakers: mockSpeakers,
    currentConferenceId: 'conf-2025',
    ticketStatuses: {},
    ticketStatusesLoading: true,
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: /filters/i }),
    )
    await userEvent.click(await canvas.findByText('Ticket not claimed'))
  },
}
