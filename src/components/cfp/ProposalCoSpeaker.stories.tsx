import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalCoSpeaker } from './ProposalCoSpeaker'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { Format } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'

const createMockSpeaker = (id: string, name: string, email: string): Speaker =>
  ({
    _id: id,
    _rev: 'rev1',
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-01T00:00:00Z',
    name,
    email,
    title: 'Engineer at TechCorp',
    slug: name.toLowerCase().replace(/\s+/g, '-'),
  }) as Speaker

const mockCoSpeakers: Speaker[] = [
  createMockSpeaker('speaker-2', 'Erik Larsen', 'erik@techcorp.no'),
]

const mockPendingInvitations: CoSpeakerInvitationMinimal[] = [
  {
    _id: 'inv-1',
    invitedEmail: 'sofia@example.com',
    invitedName: 'Sofia Berg',
    status: 'pending',
    token: 'token123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const mixedInvitations: CoSpeakerInvitationMinimal[] = [
  {
    _id: 'inv-1',
    invitedEmail: 'sofia@example.com',
    invitedName: 'Sofia Berg',
    status: 'pending',
    token: 'token123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'inv-2',
    invitedEmail: 'magnus@example.com',
    invitedName: 'Magnus Olsen',
    status: 'declined',
    token: 'token456',
    expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    declineReason: 'Schedule conflict',
  },
  {
    _id: 'inv-3',
    invitedEmail: 'ingrid@example.com',
    invitedName: 'Ingrid Nilsen',
    status: 'expired',
    token: 'token789',
    expiresAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const handlers = [
  http.post('/cfp/api/invitations/send', () => {
    return HttpResponse.json({
      success: true,
      invitation: {
        _id: 'new-inv',
        invitedEmail: 'newco@example.com',
        status: 'pending',
        token: 'newtoken',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    })
  }),
  http.post('/cfp/api/invitations/cancel', () => {
    return HttpResponse.json({ success: true })
  }),
]

const meta: Meta<typeof ProposalCoSpeaker> = {
  title: 'Systems/Proposals/ProposalCoSpeaker',
  component: ProposalCoSpeaker,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Component for managing co-speakers on a proposal. Allows inviting co-speakers via email, viewing pending invitations, and removing existing co-speakers. Respects format-specific speaker limits.',
      },
    },
    msw: { handlers },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalCoSpeaker>

export const EmptyPresentation: Story = {
  args: {
    selectedSpeakers: [],
    onSpeakersChange: fn(),
    format: Format.presentation_45,
    proposalId: 'proposal-123',
    pendingInvitations: [],
    onInvitationSent: fn(),
    onInvitationCanceled: fn(),
  },
}

export const WithCoSpeakers: Story = {
  args: {
    selectedSpeakers: mockCoSpeakers,
    onSpeakersChange: fn(),
    format: Format.presentation_45,
    proposalId: 'proposal-123',
    pendingInvitations: [],
    onInvitationSent: fn(),
    onInvitationCanceled: fn(),
  },
}

export const WithPendingInvitation: Story = {
  args: {
    selectedSpeakers: [],
    onSpeakersChange: fn(),
    format: Format.presentation_25,
    proposalId: 'proposal-123',
    pendingInvitations: mockPendingInvitations,
    onInvitationSent: fn(),
    onInvitationCanceled: fn(),
  },
}

export const MixedInvitationStatuses: Story = {
  args: {
    selectedSpeakers: mockCoSpeakers,
    onSpeakersChange: fn(),
    format: Format.workshop_120,
    proposalId: 'proposal-123',
    pendingInvitations: mixedInvitations,
    onInvitationSent: fn(),
    onInvitationCanceled: fn(),
  },
}

export const LightningTalk: Story = {
  args: {
    selectedSpeakers: [],
    onSpeakersChange: fn(),
    format: Format.lightning_10,
    proposalId: 'proposal-123',
    pendingInvitations: [],
    onInvitationSent: fn(),
    onInvitationCanceled: fn(),
  },
}

export const Workshop: Story = {
  args: {
    selectedSpeakers: mockCoSpeakers,
    onSpeakersChange: fn(),
    format: Format.workshop_240,
    proposalId: 'proposal-123',
    pendingInvitations: mockPendingInvitations,
    onInvitationSent: fn(),
    onInvitationCanceled: fn(),
  },
}

export const MaxCoSpeakersReached: Story = {
  args: {
    selectedSpeakers: [
      createMockSpeaker('speaker-2', 'Erik Larsen', 'erik@techcorp.no'),
      createMockSpeaker('speaker-3', 'Sofia Berg', 'sofia@devops.io'),
    ],
    onSpeakersChange: fn(),
    format: Format.presentation_25,
    proposalId: 'proposal-123',
    pendingInvitations: [],
    onInvitationSent: fn(),
    onInvitationCanceled: fn(),
  },
}

export const NoProposalId: Story = {
  args: {
    selectedSpeakers: [],
    onSpeakersChange: fn(),
    format: Format.presentation_45,
    proposalId: undefined,
    pendingInvitations: [],
    onInvitationSent: fn(),
    onInvitationCanceled: fn(),
  },
}
