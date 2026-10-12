import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn, within } from 'storybook/test'
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
    name: 'Aakansha Priya',
    email: 'aakanshapriya2000@gmail.com',
    slug: 'aakansha-priya',
    title: 'Solution Architect @Dash0',
    flags: [],
    links: [],
    proposals: [
      mockProposal(
        'talk-1',
        'OpenTelemetry in Practice',
        Status.confirmed,
      ),
    ],
  },
  {
    _id: 'speaker-2',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Abdel SGHIOUAR',
    email: 'abdel@abdels.me',
    slug: 'abdel-sghiouar',
    title: 'Senior Cloud Dev Advocate @Google Cloud',
    flags: [Flags.localSpeaker],
    links: [],
    proposals: [
      mockProposal('talk-2', 'Building Scalable Microservices', Status.confirmed),
    ],
  },
  {
    _id: 'speaker-3',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Abhinav Dubey',
    email: 'abhinavdubey616@gmail.com',
    slug: 'abhinav-dubey',
    title: 'Solutions Architect at Lucidity',
    flags: [],
    links: [],
    proposals: [
      mockProposal(
        'talk-3',
        'Cost Optimization on Kubernetes',
        Status.accepted,
      ),
    ],
  },
  {
    _id: 'speaker-4',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Adriana Villela',
    email: 'indycomp0t1@gmail.com',
    slug: 'adriana-villela',
    title: 'Principal Developer Advocate at Dynatrace',
    flags: [Flags.diverseSpeaker],
    links: [],
    proposals: [
      mockProposal(
        'talk-4',
        'Observability Pipelines',
        Status.confirmed,
      ),
    ],
  },
  {
    _id: 'speaker-5',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Andrés Valero',
    email: 'valero.aj@gmail.com',
    slug: 'andres-valero',
    title: 'Principal Technology Advocate',
    flags: [],
    links: [],
    proposals: [
      mockProposal(
        'talk-5',
        'Cloud Native Networking',
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
    speakers: mockSpeakers,
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
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
  },
}

export const WithoutConferenceFilter: Story = {
  args: {
    speakers: mockSpeakers,
    currentConferenceId: undefined,
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
}

/** Realistic ticket status mirroring Checkin production screenshot */
const ticketStatuses = {
  'speaker-1': {
    speakerId: 'speaker-1',
    state: 'invited' as const,
    invitedAt: '2026-10-12T08:00:00Z',
  },
  'speaker-2': {
    speakerId: 'speaker-2',
    state: 'redeemed' as const,
    fields: [
      { key: 'work_title', value: 'Senior Cloudy Developer Advocate' },
      { key: 'company', value: 'Google Cloud' },
    ],
    additionals: [
      { name: 'Consent to Media Publication', value: '1' },
      {
        name: 'Will you attend the speaker dinner? - Yes, I will attend',
        value: '1',
      },
      {
        name: 'Will you attend the conference party? - Yes, I will attend',
        value: '1',
      },
      {
        name: 'Will you attend the Monday workshops? - Yes',
        value: '1',
      },
    ],
  },
  'speaker-3': {
    speakerId: 'speaker-3',
    state: 'invited' as const,
    invitedAt: '2026-10-12T08:00:00Z',
  },
  'speaker-4': {
    speakerId: 'speaker-4',
    state: 'redeemed' as const,
    fields: [
      { key: 'work_title', value: 'Principal Developer Advocate' },
      { key: 'company', value: 'Dynatrace' },
    ],
    additionals: [
      { name: 'Consent to Media Publication', value: '1' },
      {
        name: 'Will you attend the speaker dinner? - Yes, I will attend',
        value: '1',
      },
      {
        name: 'Will you attend the conference party? - Yes, I will attend',
        value: '1',
      },
      {
        name: 'Will you attend the Monday workshops? - No',
        value: '1',
      },
    ],
  },
  'speaker-5': {
    speakerId: 'speaker-5',
    state: 'invited' as const,
    invitedAt: '2026-10-12T08:00:00Z',
  },
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
 * The conference has no speaker registration link, so no row can send and the reason
 * takes the place of every action. In the table this is the column that has to
 * hold it — the text wraps rather than clipping.
 */
export const TicketStatusNoInviteLink: Story = {
  args: {
    ...TicketStatusRowActions.args,
    ticketActionsUnavailableReason:
      'No speaker registration link — add one in Settings → Registration',
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
    // The filter panel is portalled out of the canvas root (it has to escape
    // the table's `overflow-hidden`), so query the document for its options.
    await userEvent.click(
      await within(document.body).findByText('Ticket not claimed (chase list)'),
    )
  },
}

export const TicketQuestionsUnrolled: Story = {
  args: {
    ...TicketStatus.args,
  },
  play: async ({ canvas, userEvent }) => {
    // Open Columns dropdown and toggle Monday workshops and Speaker dinner
    const columnsBtn = await canvas.findByRole('button', { name: /columns/i })
    await userEvent.click(columnsBtn)
    const workshopCol = await within(document.body).findByText('Monday workshops')
    await userEvent.click(workshopCol)
    const dinnerCol = await within(document.body).findByText('Speaker dinner')
    await userEvent.click(dinnerCol)
    // Close dropdown to inspect table
    await userEvent.click(columnsBtn)
  },
}

export const TicketFiltersOpen: Story = {
  args: {
    ...TicketStatus.args,
  },
  play: async ({ canvas, userEvent }) => {
    // Open Filters dropdown to inspect dynamic question filters
    const filtersBtn = await canvas.findByRole('button', { name: /filters/i })
    await userEvent.click(filtersBtn)
  },
}


