import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { RemoveSpeakerModal } from './RemoveSpeakerModal'
import { Status } from '@/lib/proposal/types'

const meta: Meta<typeof RemoveSpeakerModal> = {
  title: 'Systems/Proposals/Admin/RemoveSpeakerModal',
  component: RemoveSpeakerModal,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Confirms taking one speaker off a multi-speaker talk from /admin/speakers. The talk keeps its other speakers. Confirmed talks also offer a Slack request to cancel the speaker’s ticket by hand.',
      },
    },
  },
  args: {
    open: true,
    close: fn(),
    onRemoved: fn(),
    speaker: { _id: 'speaker-2', name: 'Bob Smith' },
  },
}

export default meta
type Story = StoryObj<typeof RemoveSpeakerModal>

export const AcceptedTalk: Story = {
  args: {
    proposal: {
      _id: 'proposal-1',
      title: 'Building Scalable Kubernetes Applications',
      status: Status.accepted,
    },
  },
}

export const ConfirmedTalk: Story = {
  args: {
    proposal: {
      _id: 'proposal-1',
      title: 'Building Scalable Kubernetes Applications',
      status: Status.confirmed,
    },
  },
}
