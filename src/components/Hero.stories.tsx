import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Hero } from './Hero'
import type { Conference } from '@/lib/conference/types'

const meta = {
  title: 'Components/Layout/Hero',
  component: Hero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Homepage hero with tagline, description, phase-dependent action buttons (capped at 3, tickets/program prioritized), optional venue line, vanity metrics, and mobile social links. The tickets button advertises the lowest active ticket price when available.',
      },
    },
  },
} satisfies Meta<typeof Hero>

export default meta
type Story = StoryObj<typeof meta>

const baseConference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
  tagline: 'The community conference for cloud native technologies',
  description:
    'Join hundreds of developers, platform engineers and cloud native enthusiasts for a full day of talks and workshops in Bergen.',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1, 5015 Bergen',
  startDate: '2099-09-15',
  endDate: '2099-09-15',
  cfpStartDate: '2020-01-01',
  cfpEndDate: '2020-06-01',
  cfpNotifyDate: '2020-07-01',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  programDate: '2099-07-15',
  contactEmail: 'info@example.com',
  registrationLink: 'https://tickets.example.com',
  registrationEnabled: true,
  domains: ['2026.cloudnativedays.no'],
  formats: [],
  topics: [],
  organizers: [],
  socialLinks: [],
  vanityMetrics: [
    { label: 'Attendees', value: '450+' },
    { label: 'Speakers', value: '40' },
    { label: 'Tracks', value: '4' },
  ],
} as unknown as Conference

export const RegistrationOpenWithPrice: Story = {
  args: {
    conference: baseConference,
    ticketsFromPrice: '3 490',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Registration open with pricing available from Checkin.no: the tickets button advertises the lowest price ("Get tickets — from 3 490 kr excl. VAT"). Venue line and vanity metrics visible. Resize to mobile to verify the long label wraps acceptably.',
      },
    },
  },
}

export const RegistrationOpenWithoutPrice: Story = {
  args: {
    conference: baseConference,
    ticketsFromPrice: null,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Pricing unavailable (Checkin.no down or unconfigured): the tickets button silently falls back to the plain "Tickets" label.',
      },
    },
  },
}

export const CfpOpen: Story = {
  args: {
    conference: {
      ...baseConference,
      cfpStartDate: '2020-01-01',
      cfpEndDate: '2099-06-01',
      registrationEnabled: false,
    } as unknown as Conference,
  },
  parameters: {
    docs: {
      description: {
        story: 'CFP open, registration not yet available.',
      },
    },
  },
}

export const ProgramPublished: Story = {
  args: {
    conference: {
      ...baseConference,
      programDate: '2020-07-15',
    } as unknown as Conference,
    ticketsFromPrice: '3 490',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Program published: vanity metrics remain visible (social proof stays up when purchase intent peaks) alongside program and ticket buttons.',
      },
    },
  },
}

export const MinimalConference: Story = {
  args: {
    conference: {
      ...baseConference,
      venueName: undefined,
      venueAddress: undefined,
      vanityMetrics: undefined,
      registrationEnabled: false,
    } as unknown as Conference,
  },
  parameters: {
    docs: {
      description: {
        story:
          'No venue, metrics, or registration configured: only the practical-info button renders and optional sections are omitted.',
      },
    },
  },
}
