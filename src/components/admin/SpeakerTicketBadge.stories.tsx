import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerTicketBadge } from './SpeakerTicketBadge'

const meta = {
  title: 'Systems/Speakers/Admin/SpeakerTicketBadge',
  component: SpeakerTicketBadge,
  parameters: {
    docs: {
      description: {
        component:
          'Whether a speaker has actually claimed their complimentary ticket. "Not invited" (we never sent it) and "Invited" (we sent it and they have not acted) are separate on purpose — they call for different things from the organizer. "Unknown" is the ticket provider being unreachable, which must never read as unclaimed.',
      },
    },
  },
  decorators: [
    (Story: React.ComponentType) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof SpeakerTicketBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Claimed: Story = {
  args: { status: { speakerId: 's1', state: 'redeemed' } },
}

export const Invited: Story = {
  args: {
    status: {
      speakerId: 's2',
      state: 'invited',
      invitedAt: '2026-03-01T09:00:00Z',
    },
  },
}

export const NotInvited: Story = {
  args: { status: { speakerId: 's3', state: 'not-invited' } },
}

export const Unknown: Story = {
  args: { status: { speakerId: 's4', state: 'unknown' } },
}

/**
 * The per-speaker row action, in every state at once.
 *
 * Only "Not invited" and "Invited" offer one. "Claimed" has nothing left to do,
 * and "Unknown" means the provider could not be read — inviting on a guess
 * emails someone who may already hold their ticket.
 */
export const RowActions: Story = {
  args: { status: { speakerId: 's1', state: 'redeemed' } },
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <SpeakerTicketBadge
        status={{ speakerId: 's3', state: 'not-invited' }}
        onSendInvitation={() => {}}
      />
      <SpeakerTicketBadge
        status={{
          speakerId: 's2',
          state: 'invited',
          invitedAt: '2026-03-01T09:00:00Z',
        }}
        onSendInvitation={() => {}}
      />
      <SpeakerTicketBadge
        status={{ speakerId: 's1', state: 'redeemed' }}
        onSendInvitation={() => {}}
      />
      <SpeakerTicketBadge
        status={{ speakerId: 's4', state: 'unknown' }}
        onSendInvitation={() => {}}
      />
    </div>
  ),
}

/**
 * The conference has no speaker invite link, so no row can send. The reason
 * takes the place of the action: a disabled button would say only that
 * something is wrong, and the fix is a setting the organizer owns.
 */
export const RowActionsWithoutInviteLink: Story = {
  args: { status: { speakerId: 's3', state: 'not-invited' } },
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <SpeakerTicketBadge
        status={{ speakerId: 's3', state: 'not-invited' }}
        onSendInvitation={() => {}}
        unavailableReason="No speaker invite link — add one under Settings"
      />
      <SpeakerTicketBadge
        status={{
          speakerId: 's2',
          state: 'invited',
          invitedAt: '2026-03-01T09:00:00Z',
        }}
        onSendInvitation={() => {}}
        unavailableReason="No speaker invite link — add one under Settings"
      />
      <SpeakerTicketBadge
        status={{ speakerId: 's1', state: 'redeemed' }}
        onSendInvitation={() => {}}
        unavailableReason="No speaker invite link — add one under Settings"
      />
    </div>
  ),
}

/** One invitation in flight. */
export const RowActionSending: Story = {
  args: {
    status: { speakerId: 's3', state: 'not-invited' },
    onSendInvitation: () => {},
    sending: true,
  },
}

/** All four together, for a one-look comparison of the colour vocabulary. */
export const AllStates: Story = {
  args: { status: { speakerId: 's1', state: 'redeemed' } },
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <SpeakerTicketBadge status={{ speakerId: 's1', state: 'redeemed' }} />
      <SpeakerTicketBadge
        status={{
          speakerId: 's2',
          state: 'invited',
          invitedAt: '2026-03-01T09:00:00Z',
        }}
      />
      <SpeakerTicketBadge status={{ speakerId: 's3', state: 'not-invited' }} />
      <SpeakerTicketBadge status={{ speakerId: 's4', state: 'unknown' }} />
    </div>
  ),
}
