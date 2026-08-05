import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TicketingStateNotice } from './TicketingStateNotice'

const meta = {
  title: 'Components/Feedback/TicketingStateNotice',
  component: TicketingStateNotice,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The four honest ticketing empty states an organizer can land on: not connected yet (actionable), not available for the organization (never had it), turned off by an operator (had it, someone switched it off), and not supported by the conference’s vendor. None of them is an error frame.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TicketingStateNotice>

export default meta
type Story = StoryObj<typeof meta>

/** Entitled org, conference not bound to an event yet. */
export const Unconfigured: Story = {
  args: {
    state: 'unconfigured',
    providerLabel: 'Checkin.no',
    surface: 'ticket sales',
  },
}

/** Same state on a Tito-bound conference — the copy follows the vendor. */
export const UnconfiguredTito: Story = {
  args: {
    state: 'unconfigured',
    providerLabel: 'Tito',
    surface: 'ticket types',
  },
}

/** A brand-new tenant with no ticketing integration at all. */
export const Unavailable: Story = {
  args: {
    state: 'unavailable',
    providerLabel: 'Checkin.no',
    surface: 'orders',
  },
}

/**
 * An operator switched ticketing OFF for this organization. The distinction
 * from `Unavailable` is the point: this org may have had working sales pages,
 * so the copy names what happened and who can undo it instead of claiming the
 * integration was never theirs.
 */
export const Disabled: Story = {
  args: {
    state: 'disabled',
    providerLabel: 'Checkin.no',
    surface: 'ticket sales',
  },
}

/** Discount codes are a Checkin-only API; a Tito conference gets this. */
export const Unsupported: Story = {
  args: {
    state: 'unsupported',
    providerLabel: 'Tito',
    surface: 'discount codes',
  },
}
