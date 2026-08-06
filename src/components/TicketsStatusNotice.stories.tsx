import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TicketsStatusNotice } from './TicketsStatusNotice'

const meta = {
  title: 'Components/TicketsStatusNotice',
  component: TicketsStatusNotice,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The three things /tickets can honestly say when it has no pricing grid to show (#846). These used to be ONE screen — "Tickets Coming Soon / Tickets for X are not yet available" — which was false for an external-registration tenant and false during a ticket-provider outage, and cached for hours either way.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    conferenceTitle: 'Cloud Native Days',
    startDate: '2026-09-01',
    endDate: '2026-09-02',
    contactEmail: 'hello@example.com',
  },
} satisfies Meta<typeof TicketsStatusNotice>

export default meta
type Story = StoryObj<typeof meta>

/** The ticket provider could not be reached. Claims nothing about tickets. */
export const Unavailable: Story = {
  args: {
    variant: 'unavailable',
    registrationLink: 'https://register.example/tickets',
  },
}

/** No ticket types to price, but registration is open elsewhere. */
export const RegistrationOpen: Story = {
  args: {
    variant: 'registration-open',
    registrationLink: 'https://register.example/tickets',
  },
}

/** The honest original: read succeeded, no tickets, registration not open. */
export const ComingSoon: Story = {
  args: { variant: 'coming-soon' },
}

/** An outage on a tenant that has not configured registration at all. */
export const UnavailableWithoutRegistration: Story = {
  args: { variant: 'unavailable' },
}
