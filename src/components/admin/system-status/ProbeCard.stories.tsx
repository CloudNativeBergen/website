import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline'
import { ProbeCard } from './ProbeCard'

const meta = {
  title: 'Systems/Admin/SystemStatus/ProbeCard',
  component: ProbeCard,
  parameters: { layout: 'fullscreen' },
  args: {
    onRun: fn(),
    icon: ChatBubbleLeftRightIcon,
    title: 'Slack',
    description: 'Post a test message to the weekly-update channel.',
    actionLabel: 'Send Slack test',
    pending: false,
    state: null,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ProbeCard>

export default meta
type Story = StoryObj<typeof meta>

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  )
}

export const ResultStates: Story = {
  render: (args) => (
    <div className="min-h-screen bg-gray-50 p-4">
      <Grid>
        <ProbeCard
          {...args}
          icon={ChatBubbleLeftRightIcon}
          title="Slack"
          description="Post a test message to the weekly-update channel."
          actionLabel="Send Slack test"
          pending={false}
          state={{ tone: 'success', text: 'Posted to #cndn-updates' }}
        />
        <ProbeCard
          {...args}
          icon={EnvelopeIcon}
          title="Email"
          description="Send a test email to your own address via Resend."
          actionLabel="Send test email"
          pending={true}
          state={null}
        />
        <ProbeCard
          {...args}
          icon={CircleStackIcon}
          title="Sanity write"
          description="Create and delete a scratch document through the write client."
          actionLabel="Run write probe"
          pending={false}
          state={{
            tone: 'warn',
            text: 'Please wait 30 seconds before running this probe again.',
            detail: '12 ms',
          }}
        />
      </Grid>
    </div>
  ),
}

export const Dark: Story = {
  render: (args) => (
    <div className="dark min-h-screen bg-gray-950 p-4">
      <Grid>
        <ProbeCard
          {...args}
          icon={ChatBubbleLeftRightIcon}
          title="Slack"
          description="Post a test message to the weekly-update channel."
          actionLabel="Send Slack test"
          pending={false}
          state={{ tone: 'success', text: 'Posted to #cndn-updates' }}
        />
        <ProbeCard
          {...args}
          icon={EnvelopeIcon}
          title="Email"
          description="Send a test email to your own address via Resend."
          actionLabel="Send test email"
          pending={false}
          state={{
            tone: 'success',
            text: 'Test email sent to your address',
            detail: 'Resend id: 9f1c-4a2e-bd77',
          }}
        />
        <ProbeCard
          {...args}
          icon={CircleStackIcon}
          title="Sanity write"
          description="Create and delete a scratch document through the write client."
          actionLabel="Run write probe"
          pending={false}
          state={{
            tone: 'warn',
            text: 'Sanity write probe failed',
            detail: '204 ms',
          }}
        />
      </Grid>
    </div>
  ),
}
