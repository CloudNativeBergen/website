import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  PortalAfterTheEvent,
  PortalAtTheEvent,
  PortalWhatHappensNext,
} from './PortalPhaseBlocks'
import type { PortalAfterSigning } from '@/lib/sponsor-crm/registration'

const a: PortalAfterSigning = {
  invoiceStatus: 'not-sent',
  invoiceSentAt: null,
  invoicePaidAt: null,
  discountCodes: ['ACME26-A', 'ACME26-B'],
  ticketUrl: 'https://tickets.example.com/sponsors',
  earlyAccessPath: '/workshop/early-access/example-token',
  workshopSponsorStart: '2026-09-01T08:00:00Z',
  workshopOpening: '2026-09-08T08:00:00Z',
  startDate: '2026-10-15',
  endDate: '2026-10-16',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1, Bergen',
  venueTravelInfo:
    'Take the light rail to Byparken, then walk five minutes.\nParking at Bygarasjen.',
  onsiteContact: {
    name: 'Kari Nordmann',
    email: null,
  },
  contactEmail: 'hello@example.com',
  sponsorEmail: 'sponsors@example.com',
  hasPhotoWall: true,
}

const meta = {
  title: 'Systems/Sponsors/Portal/PortalPhaseBlocks',
  component: PortalWhatHappensNext,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The sponsor portal blocks after signing: what happens next, at the event (from 4 weeks before), and a thank-you for 90 days after.',
      },
    },
  },
  tags: ['autodocs'],
  args: { a },
} satisfies Meta<typeof PortalWhatHappensNext>

export default meta
type Story = StoryObj<typeof meta>

export const SignedInvoicePending: Story = {}

export const SignedPaid: Story = {
  args: {
    a: {
      ...a,
      invoiceStatus: 'paid',
      invoiceSentAt: '2026-08-20T10:00:00Z',
      invoicePaidAt: '2026-09-02T10:00:00Z',
      earlyAccessPath: null,
    },
  },
}

export const AtTheEvent: Story = {
  render: (args) => <PortalAtTheEvent {...args} />,
}

export const AfterTheEvent: Story = {
  render: (args) => (
    <PortalAfterTheEvent {...args} conferenceName="Cloud Native Days 2026" />
  ),
}
