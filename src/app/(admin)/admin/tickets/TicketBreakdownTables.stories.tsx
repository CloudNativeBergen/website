import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  CategoryBreakdownTable,
  FreeTicketAllocationTable,
  SponsorAllocationTable,
} from './TicketBreakdownTables'
import type { CategoryStat, SponsorTicketData } from '@/lib/tickets/utils'
import type { FreeTicketAllocation } from '@/lib/tickets/freeAllocation'

/**
 * The live shape: each category counted from its own source, and the organizer
 * row UNKNOWN — an organizer comp is indistinguishable from any other free
 * ticket, so it is never a zero, and one unknown row leaves the total without
 * an honest percentage.
 */
const allocation: FreeTicketAllocation = {
  sponsors: {
    allocated: 24,
    claimed: 9,
    fromProvider: false,
    status:
      'Redemptions of 100%-off sponsor codes; 2 sponsors with an allowance have no code yet.',
  },
  speakers: {
    allocated: 18,
    claimed: 12,
    fromProvider: false,
    status: '4 invitations unclaimed · 2 speakers never invited.',
  },
  organizers: {
    allocated: 9,
    claimed: 'unknown',
    fromProvider: false,
    status: 'Organizer comps cannot be told apart from any other free ticket.',
  },
  totalAllocated: 51,
  totalClaimed: 'unknown',
}

const categoryStats: CategoryStat[] = [
  {
    category: 'Early Bird',
    count: 148,
    orders: 96,
    revenue: 666000,
    percentage: 45.1,
  },
  {
    category: 'Standard',
    count: 115,
    orders: 88,
    revenue: 632500,
    percentage: 35,
  },
  {
    category: 'Student',
    count: 39,
    orders: 31,
    revenue: 58500,
    percentage: 11.9,
  },
  {
    category: 'Workshop Pass',
    count: 26,
    orders: 22,
    revenue: 195000,
    percentage: 8,
  },
]

const tierData: Record<string, SponsorTicketData> = {
  'Platinum Partner': { sponsors: 2, tickets: 12, ticketsPerSponsor: 6 },
  Gold: { sponsors: 4, tickets: 8, ticketsPerSponsor: 2 },
  Silver: { sponsors: 8, tickets: 8, ticketsPerSponsor: 1 },
}

const meta = {
  title: 'Systems/Tickets/Admin/TicketBreakdownTables',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The three breakdown tables under the ticket overview. Below `md` every `DataTable` row becomes a card: the percentage bar and the sponsor status sentence get their own full-width block there, because a bar or a sentence squeezed into the right half of a ~280px line is unreadable.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen space-y-6 bg-gray-50 p-4 dark:bg-gray-950">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const AllThree = () => (
  <>
    <FreeTicketAllocationTable allocation={allocation} />
    <CategoryBreakdownTable stats={categoryStats} />
    <SponsorAllocationTable tierData={tierData} totalSponsorTickets={28} />
  </>
)

/** All three tables at the width they were designed for. */
export const Default: Story = {
  render: () => <AllThree />,
}

/**
 * The phone case, pinned. `defaultViewport` is load-bearing:
 * `.storybook/test-runner.ts` reads it and resizes the page, and its default is
 * 1280 — without it this story renders the desktop table and the assertions
 * below pass for the wrong reason.
 *
 * Both halves are the net: the cards must be there (no `<table>` on screen) AND
 * the percentage bar must actually span the card, which is what the old fixed
 * `w-16` bar in a right-aligned cell did not.
 */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  render: () => <AllThree />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Cards, not a table: every `<table>` is in the `hidden md:block` half.
    for (const table of canvasElement.querySelectorAll('table')) {
      await expect(table).not.toBeVisible()
    }

    const percentage = await canvas.findAllByText('45.1%')
    const bar = percentage[0].parentElement!.querySelector<HTMLElement>(
      '[data-progress-track]',
    )!
    const card = percentage[0].closest('.rounded-lg')!
    // It runs to the card's padding edge rather than stopping at the old fixed
    // 64px stub — the label ahead of it takes the rest of the line.
    await expect(bar.getBoundingClientRect().width).toBeGreaterThan(150)
    await expect(bar.getBoundingClientRect().right).toBeGreaterThan(
      card.getBoundingClientRect().right - 24,
    )
  },
}

/**
 * Every claim count knowable: the total states a rate. Only reachable once an
 * organizer comp can be identified, so it is the shape to design against, not
 * today's data.
 */
export const AllCategoriesCounted: Story = {
  render: () => (
    <FreeTicketAllocationTable
      allocation={{
        ...allocation,
        organizers: {
          ...allocation.organizers,
          claimed: 7,
          status: 'Organizer comps issued from the crew ticket type.',
        },
        totalClaimed: 28,
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('28 claimed (54.9%)')).toBeVisible()
  },
}

/**
 * The ticket read failed, so the sponsor count is the provider's own redemption
 * counter — named on screen rather than passed off as ours, exactly as
 * `DiscountCodeManager` does it.
 */
export const ProviderSourcedSponsorCount: Story = {
  render: () => (
    <FreeTicketAllocationTable
      allocation={{
        ...allocation,
        sponsors: { ...allocation.sponsors, fromProvider: true },
      }}
      providerLabel="Checkin"
    />
  ),
  play: async ({ canvasElement }) => {
    // The desktop table, not the `hidden md:block` card copy of every row.
    const table = within(canvasElement.querySelector('table')!)
    await expect(await table.findByText('Checkin count')).toBeVisible()
  },
}

/** A sponsor redeemed more than their tier includes — shown, never clamped. */
export const OverRedeemed: Story = {
  render: () => (
    <FreeTicketAllocationTable
      allocation={{
        ...allocation,
        sponsors: { ...allocation.sponsors, allocated: 4, claimed: 9 },
        totalAllocated: 31,
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const table = within(canvasElement.querySelector('table')!)
    await expect(await table.findByText('over allocation')).toBeVisible()
  },
}

export const MobileDark: Story = {
  // `globals`, not a parameter: the preview decorator puts the `dark` class on
  // from `context.globals.theme`.
  globals: { theme: 'dark' },
  parameters: { viewport: { defaultViewport: 'phone' } },
  render: () => <AllThree />,
}
