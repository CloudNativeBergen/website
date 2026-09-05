import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TicketPricingGrid } from './TicketPricingGrid'
import type { PublicTicketType } from '@/lib/tickets/public'

function ticket(over: Partial<PublicTicketType> = {}): PublicTicketType {
  return {
    id: 1,
    name: 'Conference',
    type: 'standard',
    description: null,
    price: [{ price: '4000', vat: '25', description: null, key: null }],
    available: null,
    requiresInvitation: false,
    visibleStartsAt: null,
    visibleEndsAt: null,
    position: 0,
    ...over,
  }
}

const meta = {
  title: 'Components/TicketPricingGrid',
  component: TicketPricingGrid,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The public pricing grid. The free-to-attend states exist because a free event\'s ticket types were filtered out of the page entirely (#846) — they now reach the grid and render as "Free" rather than as nothing or as "NOK 0".',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TicketPricingGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Paid: Story = {
  args: {
    tickets: [
      ticket({ id: 1, name: 'Conference' }),
      ticket({
        id: 2,
        name: 'Conference + Workshop',
        position: 1,
        price: [{ price: '6000', vat: '25', description: null, key: null }],
      }),
    ],
    registrationLink: 'https://register.example/tickets',
  },
}

/**
 * A free-to-attend event. Every type costs nothing, so the VAT footnote is
 * replaced and each price cell reads "Free".
 */
export const FreeToAttend: Story = {
  args: {
    free: true,
    tickets: [
      ticket({ id: 1, name: 'Conference', price: [] }),
      ticket({
        id: 2,
        name: 'Workshop day',
        position: 1,
        price: [{ price: '0', vat: '0', description: null, key: null }],
      }),
    ],
    registrationLink: 'https://register.example/free-event',
  },
}

/** A free event with no registration link configured yet — no CTA to offer. */
export const FreeToAttendWithoutRegistration: Story = {
  args: {
    free: true,
    tickets: [ticket({ id: 1, name: 'Conference', price: [] })],
  },
}

/**
 * A paid event whose registration is closed. `/tickets` withholds the link, so
 * the prices stand on their own with no CTA and no registration footnote.
 */
export const PaidWithoutRegistration: Story = {
  args: {
    tickets: [
      ticket({ id: 1, name: 'Conference' }),
      ticket({
        id: 2,
        name: 'Conference + Workshop',
        position: 1,
        price: [{ price: '6000', vat: '25', description: null, key: null }],
      }),
    ],
  },
}

/**
 * A PAID event whose organizer opted a free type in via
 * `publicFreeTicketIds` (#860). "Student" has no "Tier:" prefix, so it renders
 * as a standalone card — the shape a real student tier produces. The grid is
 * NOT `free`: paid types are present, so the VAT footnote stands, and only the
 * free card's CTA reads "Register".
 */
export const PaidWithFreeTier: Story = {
  args: {
    tickets: [
      ticket({ id: 1, name: 'Conference' }),
      ticket({
        id: 2,
        name: 'Conference + Workshop',
        position: 1,
        price: [{ price: '6000', vat: '25', description: null, key: null }],
      }),
      ticket({ id: 3, name: 'Student', position: 2, price: [] }),
    ],
    registrationLink: 'https://register.example/tickets',
  },
}

/**
 * The opted-in free type's other shape: a "Tier: Category" name lands it in
 * the pricing matrix, where its cell reads "Free" among the priced ones.
 */
export const TieredWithFreeTier: Story = {
  args: {
    tickets: [
      ticket({ id: 1, name: 'Early Bird: Conference', position: 0 }),
      ticket({
        id: 2,
        name: 'Regular: Conference',
        position: 1,
        price: [{ price: '5000', vat: '25', description: null, key: null }],
      }),
      ticket({
        id: 3,
        name: 'Early Bird: Student',
        position: 2,
        price: [],
      }),
    ],
    registrationLink: 'https://register.example/tickets',
  },
}

/** Tiered pricing, the matrix layout. */
export const Tiered: Story = {
  args: {
    tickets: [
      ticket({ id: 1, name: 'Early Bird: Conference', position: 0 }),
      ticket({
        id: 2,
        name: 'Regular: Conference',
        position: 1,
        price: [{ price: '5000', vat: '25', description: null, key: null }],
      }),
      ticket({
        id: 3,
        name: 'Early Bird: Conference + Workshop',
        position: 2,
        price: [{ price: '6000', vat: '25', description: null, key: null }],
      }),
      ticket({
        id: 4,
        name: 'Regular: Conference + Workshop',
        position: 3,
        price: [{ price: '7000', vat: '25', description: null, key: null }],
      }),
    ],
    registrationLink: 'https://register.example/tickets',
  },
}
