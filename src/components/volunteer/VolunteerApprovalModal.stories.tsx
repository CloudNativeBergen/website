import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ThemeProvider } from 'next-themes'
import { VolunteerApprovalModal } from './VolunteerApprovalModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  Occupation,
  TShirtSize,
  VolunteerStatus,
  type VolunteerWithConference,
} from '@/lib/volunteer/types'

const mockConference = {
  _id: 'conf-123',
  title: 'Cloud Native Days Bergen 2026',
  contactEmail: 'organizers@cloudnativebergen.dev',
  cfpEmail: 'cfp@cloudnativebergen.dev',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-10-28T09:00:00Z',
  domains: ['cloudnativebergen.dev'],
  organizer: 'Cloud Native Bergen',
  volunteerRegistrationLink: 'https://tickets.example.test/volunteer-register',
  volunteerSlackInviteUrl: 'https://slack.example.test/volunteer-invite',
  theme: {
    primaryColor: '#1D4ED8',
  },
}

const volunteerWithLinks: VolunteerWithConference = {
  _id: 'vol-1',
  _rev: 'rev-1',
  _createdAt: '2026-06-01T10:00:00Z',
  _updatedAt: '2026-06-01T10:00:00Z',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+47 987 65 432',
  occupation: Occupation.WORKING,
  availability: 'Full day Wednesday and Thursday morning',
  preferredTasks: ['Speaker Check-in', 'Info Desk'],
  tshirtSize: TShirtSize.M,
  status: VolunteerStatus.PENDING,
  submittedAt: '2026-06-01T10:00:00Z',
  conference: mockConference,
}

const volunteerWithoutLinks: VolunteerWithConference = {
  ...volunteerWithLinks,
  _id: 'vol-2',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  conference: {
    ...mockConference,
    volunteerRegistrationLink: undefined,
    volunteerSlackInviteUrl: undefined,
  },
}

const meta = {
  title: 'Systems/People/Admin/VolunteerApprovalModal',
  component: VolunteerApprovalModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal for approving volunteers and sending branded email with ticket registration and Slack workspace invitations.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  args: {
    isOpen: true,
    volunteer: volunteerWithLinks,
    onClose: fn(),
    onSend: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof VolunteerApprovalModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithoutConfiguredLinks: Story = {
  args: {
    volunteer: volunteerWithoutLinks,
  },
}

export const Dark: Story = {
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}
