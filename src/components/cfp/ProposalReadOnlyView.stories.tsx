import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalReadOnlyView } from './ProposalReadOnlyView'
import {
  Format,
  Language,
  Level,
  ProposalExisting,
  Status,
} from '@/lib/proposal/types'

const baseProposal = {
  _id: 'proposal-1',
  _rev: 'rev-1',
  _type: 'talk',
  _createdAt: '2026-03-01T10:00:00Z',
  _updatedAt: '2026-03-02T10:00:00Z',
  title: 'Scaling Kubernetes Operators in Production',
  description: 'How we run dozens of operators without losing sleep.',
  outline: '1. Background\n2. Lessons learned\n3. Q&A',
  format: Format.presentation_25,
  language: Language.english,
  level: Level.intermediate,
  audiences: [],
  topics: [],
  tos: true,
  status: Status.confirmed,
  conference: { _type: 'reference', _ref: 'conference-1' },
} as unknown as ProposalExisting

const meta: Meta<typeof ProposalReadOnlyView> = {
  title: 'Systems/Proposals/ProposalReadOnlyView',
  component: ProposalReadOnlyView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Read-only view of a proposal for speakers. Shown for closed statuses and after the conference is over. Shows the status badge and, for withdrawn talks, the reason.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof ProposalReadOnlyView>

export const Confirmed: Story = {
  args: { proposal: baseProposal },
}

export const Withdrawn: Story = {
  args: {
    proposal: {
      ...baseProposal,
      status: Status.withdrawn,
      withdrawnReason: 'I have a schedule conflict on the day.',
    },
  },
}
