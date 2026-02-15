import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AudienceFeedbackPanel } from './AudienceFeedbackPanel'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

const meta: Meta<typeof AudienceFeedbackPanel> = {
  title: 'Systems/Proposals/Admin/AudienceFeedbackPanel',
  component: AudienceFeedbackPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Panel for recording and displaying audience traffic-light feedback (green/yellow/red card counts) collected during conference sessions. Only renders when the proposal is accepted or confirmed and the conference has started.',
      },
    },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="max-w-md">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof AudienceFeedbackPanel>

export const WithFeedback: Story = {
  args: {
    proposalId: 'proposal-1',
    currentFeedback: {
      greenCount: 42,
      yellowCount: 15,
      redCount: 3,
      lastUpdatedAt: '2024-11-05T15:30:00Z',
    },
    status: 'confirmed',
    conferenceStartDate: '2024-11-04',
  },
}

export const NoFeedback: Story = {
  args: {
    proposalId: 'proposal-1',
    currentFeedback: null,
    status: 'confirmed',
    conferenceStartDate: '2024-11-04',
  },
}

export const AcceptedStatus: Story = {
  args: {
    proposalId: 'proposal-1',
    currentFeedback: {
      greenCount: 30,
      yellowCount: 10,
      redCount: 5,
    },
    status: 'accepted',
    conferenceStartDate: '2024-11-04',
  },
}

export const ConferenceNotStarted: Story = {
  args: {
    proposalId: 'proposal-1',
    currentFeedback: null,
    status: 'confirmed',
    conferenceStartDate: '2099-12-31',
  },
  parameters: {
    docs: {
      description: {
        story:
          'When the conference has not yet started, this component renders nothing.',
      },
    },
  },
}

export const SubmittedStatus: Story = {
  args: {
    proposalId: 'proposal-1',
    currentFeedback: null,
    status: 'submitted',
    conferenceStartDate: '2024-11-04',
  },
  parameters: {
    docs: {
      description: {
        story:
          'When the proposal is not accepted or confirmed, this component renders nothing.',
      },
    },
  },
}
