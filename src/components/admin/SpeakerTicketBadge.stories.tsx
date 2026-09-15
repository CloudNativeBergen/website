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
