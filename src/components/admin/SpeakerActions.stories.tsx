import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerActions } from './SpeakerActions'
import { NotificationProvider } from './NotificationProvider'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { Conference } from '@/lib/conference/types'
import { Format } from '@/lib/proposal/types'

const mockConference: Conference = {
  _id: 'conf-2025',
  title: 'Cloud Native Day Bergen 2025',
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2025-09-18',
  endDate: '2025-09-18',
  cfpStartDate: '2025-03-01',
  cfpEndDate: '2025-06-15',
  cfpNotifyDate: '2025-07-01',
  cfpEmail: 'cfp@cloudnativeday.no',
  sponsorEmail: 'sponsor@cloudnativeday.no',
  programDate: '2025-07-15',
  contactEmail: 'info@cloudnativeday.no',
  registrationEnabled: true,
  organizers: [],
  domains: ['cloudnativeday.no'],
  formats: [Format.lightning_10, Format.presentation_25, Format.workshop_120],
  topics: [],
  socialLinks: [
    'https://twitter.com/cloudnativeday',
    'https://linkedin.com/company/cloudnativeday',
  ],
}

const meta: Meta<typeof SpeakerActions> = {
  title: 'Systems/Speakers/SpeakerActions',
  component: SpeakerActions,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Action buttons and modal for managing speaker communications. Provides functionality to send broadcast emails to all confirmed speakers and sync contacts with email service.',
      },
    },
    msw: {
      handlers: [
        http.post('/admin/api/speakers/email/broadcast', () => {
          return HttpResponse.json({ success: true, sentCount: 15 })
        }),
        http.post('/admin/api/speakers/email/audience/sync', () => {
          return HttpResponse.json({ success: true, syncedCount: 20 })
        }),
      ],
    },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="p-4">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SpeakerActions>

export const ModalOpen: Story = {
  args: {
    eligibleSpeakersCount: 15,
    fromEmail: 'speakers@cloudnativeday.no',
    conference: mockConference,
    isModalOpen: true,
    setIsModalOpen: fn(),
  },
}

export const ModalClosed: Story = {
  args: {
    eligibleSpeakersCount: 15,
    fromEmail: 'speakers@cloudnativeday.no',
    conference: mockConference,
    isModalOpen: false,
    setIsModalOpen: fn(),
  },
}

export const ManySpeakers: Story = {
  args: {
    eligibleSpeakersCount: 45,
    fromEmail: 'speakers@cloudnativeday.no',
    conference: mockConference,
    isModalOpen: true,
    setIsModalOpen: fn(),
  },
}

export const SingleSpeaker: Story = {
  args: {
    eligibleSpeakersCount: 1,
    fromEmail: 'speakers@cloudnativeday.no',
    conference: mockConference,
    isModalOpen: true,
    setIsModalOpen: fn(),
  },
}

export const NoSocialLinks: Story = {
  args: {
    eligibleSpeakersCount: 15,
    fromEmail: 'speakers@cloudnativeday.no',
    conference: { ...mockConference, socialLinks: [] },
    isModalOpen: true,
    setIsModalOpen: fn(),
  },
}
