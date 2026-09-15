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
 * The conference has no speaker registration link, so no row can send. The reason
 * takes the place of the action: a disabled button would say only that
 * something is wrong, and the fix is a setting the organizer owns.
 *
 * "Find ticket" stays on the first row on purpose (#1067 x #1068): linking an
 * address sends nothing, so a blocked invitation must not also block the one
 * action that can still fix an unmatched ticket.
 */
export const RowActionsWithoutInviteLink: Story = {
  args: { status: { speakerId: 's3', state: 'not-invited' } },
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <SpeakerTicketBadge
        status={{ speakerId: 's3', state: 'not-invited' }}
        onSendInvitation={() => {}}
        onFindTicket={() => {}}
        unavailableReason="No speaker registration link — add one in Settings → Registration"
      />
      <SpeakerTicketBadge
        status={{
          speakerId: 's2',
          state: 'invited',
          invitedAt: '2026-03-01T09:00:00Z',
        }}
        onSendInvitation={() => {}}
        unavailableReason="No speaker registration link — add one in Settings → Registration"
      />
      <SpeakerTicketBadge
        status={{ speakerId: 's1', state: 'redeemed' }}
        onSendInvitation={() => {}}
        unavailableReason="No speaker registration link — add one in Settings → Registration"
      />
    </div>
  ),
}

/**
 * The "Find ticket" action, which opens the event's ticket search so an
 * organizer can link the address a ticket was actually bought under.
 *
 * Offered on the two states where a ticket may exist under an address we do not
 * hold. "Claimed" already matches, and "Unknown" means the ticket list could
 * not be read, so there is nothing to search.
 */
export const FindTicketAction: Story = {
  args: { status: { speakerId: 's1', state: 'redeemed' } },
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <SpeakerTicketBadge
        status={{ speakerId: 's3', state: 'not-invited' }}
        onSendInvitation={() => {}}
        onFindTicket={() => {}}
      />
      <SpeakerTicketBadge
        status={{
          speakerId: 's2',
          state: 'invited',
          invitedAt: '2026-03-01T09:00:00Z',
        }}
        onSendInvitation={() => {}}
        onFindTicket={() => {}}
      />
      <SpeakerTicketBadge
        status={{ speakerId: 's1', state: 'redeemed' }}
        onSendInvitation={() => {}}
        onFindTicket={() => {}}
      />
      <SpeakerTicketBadge
        status={{ speakerId: 's4', state: 'unknown' }}
        onSendInvitation={() => {}}
        onFindTicket={() => {}}
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
