import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalActionModal } from './ProposalActionModal'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
  Action,
} from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { fn } from 'storybook/test'

const mockSpeaker: Speaker = {
  _id: 'speaker-1',
  _rev: '1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  slug: 'alice-johnson',
}

const mockProposal: ProposalExisting = {
  _id: 'proposal-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Building Scalable Kubernetes Applications',
  description: convertStringToPortableTextBlocks(
    'A deep dive into Kubernetes best practices.',
  ),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.submitted,
  outline: '',
  topics: [],
  tos: true,
  speakers: [mockSpeaker],
  conference: { _type: 'reference', _ref: 'conf-1' },
}

const meta: Meta<typeof ProposalActionModal> = {
  title: 'Systems/Proposals/Admin/ProposalActionModal',
  component: ProposalActionModal,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Modal dialog for performing status actions on proposals (accept, reject, remind, delete, etc.). Displays action-specific icon and color, a confirmation message with the proposal title and speaker name, an optional email notification toggle, and a comment field.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof ProposalActionModal>

export const AcceptAction: Story = {
  args: {
    open: true,
    close: fn(),
    proposal: mockProposal,
    action: Action.accept,
    adminUI: true,
    onAction: fn(),
    domain: 'cloudnativeday.no',
  },
}

export const RejectAction: Story = {
  args: {
    open: true,
    close: fn(),
    proposal: mockProposal,
    action: Action.reject,
    adminUI: true,
    onAction: fn(),
    domain: 'cloudnativeday.no',
  },
}

export const RemindAction: Story = {
  args: {
    open: true,
    close: fn(),
    proposal: mockProposal,
    action: Action.remind,
    adminUI: true,
    onAction: fn(),
    domain: 'cloudnativeday.no',
  },
}

export const DeleteAction: Story = {
  args: {
    open: true,
    close: fn(),
    proposal: mockProposal,
    action: Action.delete,
    adminUI: true,
    onAction: fn(),
  },
}

export const SpeakerWithdraw: Story = {
  args: {
    open: true,
    close: fn(),
    proposal: mockProposal,
    action: Action.withdraw,
    adminUI: false,
    onAction: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Non-admin view used by speakers to withdraw their own proposal.',
      },
    },
  },
}

export const SpeakerSubmit: Story = {
  args: {
    open: true,
    close: fn(),
    proposal: { ...mockProposal, status: Status.draft },
    action: Action.submit,
    adminUI: false,
    onAction: fn(),
  },
}
