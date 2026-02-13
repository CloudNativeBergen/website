import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CallToAction } from './CallToAction'
import type { Conference } from '@/lib/conference/types'

const meta = {
  title: 'Components/Layout/CallToAction',
  component: CallToAction,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Call-to-action section with speaker submission and ticket reservation buttons. Conditionally renders based on conference state (registration availability, CFP status). Returns null if no actions are available.',
      },
    },
  },
} satisfies Meta<typeof CallToAction>

export default meta
type Story = StoryObj<typeof meta>

const baseConference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-09-15',
  endDate: '2026-09-15',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-06-01',
  cfpNotifyDate: '2026-07-01',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  programDate: '2026-07-15',
  contactEmail: 'info@example.com',
  registrationLink: 'https://tickets.example.com',
  registrationEnabled: true,
  domains: ['2026.cloudnativedays.no'],
  formats: [],
  topics: [],
  organizers: [],
} as unknown as Conference

export const Default: Story = {
  args: {
    conference: baseConference,
  },
}

export const OrganizersView: Story = {
  args: {
    conference: baseConference,
    isOrganizers: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Organizer page variant hides speaker submission by default and shows a community-focused message.',
      },
    },
  },
}

export const SpeakerSubmissionOnly: Story = {
  args: {
    conference: {
      ...baseConference,
      registrationEnabled: false,
      registrationLink: undefined,
    } as unknown as Conference,
    showSpeakerSubmission: true,
    showTicketReservation: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'When registration is not available, only the speaker submission CTA is shown.',
      },
    },
  },
}

export const CustomText: Story = {
  args: {
    conference: baseConference,
    title: 'Be Part of Something Amazing',
    description:
      'Join 500+ cloud native enthusiasts for a day of learning, networking, and inspiration in Bergen.',
  },
}

export const TicketsOnly: Story = {
  args: {
    conference: baseConference,
    showSpeakerSubmission: false,
    showTicketReservation: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Only the ticket reservation button is displayed.',
      },
    },
  },
}
