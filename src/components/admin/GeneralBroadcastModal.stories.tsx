import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { GeneralBroadcastModal } from './GeneralBroadcastModal'
import { NotificationProvider } from './NotificationProvider'

const meta = {
  title: 'Systems/Speakers/Admin/GeneralBroadcastModal',
  component: GeneralBroadcastModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Broadcast email composition modal for sending bulk emails to groups (e.g., confirmed speakers, attendees). Wraps the generic EmailModal with recipient count display, sync button, personalization templates (`{{{FIRST_NAME|there}}}`), and BroadcastTemplate preview.',
      },
    },
  },
  decorators: [
    (Story: React.ComponentType) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  args: {
    isOpen: true,
    onClose: fn(),
    onSend: fn(),
    onSyncContacts: fn(),
    fromEmail: 'conference@cloudnativebergen.no',
    eventName: 'Cloud Native Days Bergen 2025',
    eventLocation: 'Bergen, Norway',
    eventDate: '2025-06-12',
    eventUrl: 'https://cloudnativedays.no',
    socialLinks: [
      'https://twitter.com/cloudnativebrg',
      'https://linkedin.com/company/cloudnativebergen',
    ],
  },
} satisfies Meta<typeof GeneralBroadcastModal>

export default meta
type Story = StoryObj<typeof meta>

export const Speakers: Story = {
  args: {
    recipientCount: 24,
    recipientType: 'speakers',
  },
}

export const Attendees: Story = {
  args: {
    recipientCount: 350,
    recipientType: 'attendees',
  },
  parameters: {
    docs: {
      description: {
        story: 'Broadcast targeting all confirmed attendees.',
      },
    },
  },
}

export const NoRecipients: Story = {
  args: {
    recipientCount: 0,
    recipientType: 'speakers',
  },
  parameters: {
    docs: {
      description: {
        story:
          'When no recipients are available, the sync button can be used to refresh the contact list.',
      },
    },
  },
}
