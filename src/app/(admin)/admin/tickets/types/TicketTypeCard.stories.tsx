import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, within } from 'storybook/test'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { TicketTypeCard } from './TicketTypeCard'
import type { PublicTicketType } from '@/lib/tickets/provider/types'

const paidTicket: PublicTicketType = {
  id: 4821,
  name: 'Conference Pass',
  type: 'regular',
  description: 'Two days of talks, lunch and the evening social.',
  price: [
    {
      price: '4500.00',
      vat: '25',
      description: 'Early bird, until 1 May',
      key: 'nok',
    },
  ],
  available: 120,
  requiresInvitation: false,
  visibleStartsAt: '2026-01-15T09:00:00Z',
  visibleEndsAt: '2026-05-01T21:59:00Z',
  position: 1,
}

const freeTicket: PublicTicketType = {
  id: 4822,
  name: 'Community Ticket',
  type: 'free',
  description: null,
  price: [{ price: '0.00', vat: '0', description: null, key: 'nok' }],
  available: null,
  requiresInvitation: false,
  visibleStartsAt: null,
  visibleEndsAt: null,
  position: 2,
}

const meta = {
  title: 'Systems/Tickets/Admin/TicketTypeCard',
  component: TicketTypeCard,
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.post('/api/trpc/conference.updatePublicFreeTickets', () =>
          HttpResponse.json({ result: { data: { success: true } } }),
        ),
        http.post('/api/trpc/tickets.admin.setTicketTypeRole', () =>
          HttpResponse.json({ result: { data: { success: true } } }),
        ),
      ],
    },
    docs: {
      description: {
        component:
          'One row of /admin/tickets/types. The price and its VAT stay on one line; a price description gets its own line rather than trailing the same sentence, which is what wrapped badly at phone width.',
      },
    },
  },
  args: { ticket: paidTicket, publicFreeTicketIds: [] },
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
              <div className="min-h-screen space-y-4 bg-gray-50 p-4 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
} satisfies Meta<typeof TicketTypeCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** A free type: the #860 public opt-in appears on the bottom row. */
export const PublicFreeType: Story = {
  args: { ticket: freeTicket, publicFreeTicketIds: [4822] },
}

/**
 * The phone case, pinned. `defaultViewport` is load-bearing: the test runner
 * reads it and resizes the page, and its default is 1280 — without it the
 * assertions below would run at desktop width and prove nothing.
 *
 * Both halves are the net: the price line must not wrap AND the description
 * must be on a line of its own below it.
 */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const price = await canvas.findByText(/incl\. 25% VAT/)
    const priceLine = price.parentElement!
    // Neither half may break mid-number: "NOK 4 500" and the VAT parenthesis
    // each stay on one line, whatever the card width does to the pair.
    await expect(price.getBoundingClientRect().height).toBeLessThan(28)
    await expect(
      canvas.getByText(/NOK/).getBoundingClientRect().height,
    ).toBeLessThan(28)

    const description = canvas.getByText('Early bird, until 1 May')
    await expect(description).toBeVisible()
    await expect(
      description.getBoundingClientRect().top,
    ).toBeGreaterThanOrEqual(priceLine.getBoundingClientRect().bottom)
  },
}

/**
 * The ROLE row — the three states of `conference.ticketTypeRoles`, which is what
 * the participant count on /admin/tickets is built from.
 *
 * PROPOSED. `lib/tickets/discovery` read co-holding off the event's own tickets
 * and suggested this type seats nobody. It must read as a suggestion, with the
 * evidence and the sample on the card: an organizer confirming a role they
 * cannot check is how a wrong number becomes a blessed one.
 */
export const RoleProposed: Story = {
  args: {
    ticket: {
      ...paidTicket,
      id: 4823,
      name: 'Sponsor discount (workshop upgrade)',
      description: null,
    },
    roleProposal: {
      typeName: 'Sponsor discount (workshop upgrade)',
      admits: false,
      grants: 'unknown',
      evidence: '10 of 10 holders also hold a “Conference Pass” ticket',
      sampleSize: 10,
      confidence: 'high',
    },
  },
}

/** A small sample is proposed too — flagged, not hidden. */
export const RoleProposedLowConfidence: Story = {
  args: {
    ...RoleProposed.args,
    roleProposal: {
      ...RoleProposed.args!.roleProposal!,
      sampleSize: 2,
      confidence: 'low',
    },
  },
}

/** DECLARED: settled, and still changeable without Sanity Studio. */
export const RoleDeclared: Story = {
  args: { ...RoleProposed.args, declaredAdmits: false },
}

/** UNKNOWN: nothing declared, nothing hinted — and it says what it counts. */
export const RoleUnknown: Story = {}

export const RoleProposedMobile: Story = {
  args: RoleProposed.args,
  parameters: { viewport: { defaultViewport: 'phone' } },
}

export const RoleProposedMobileDark: Story = {
  args: RoleProposed.args,
  parameters: {
    viewport: { defaultViewport: 'phone' },
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}

export const MobileDark: Story = {
  parameters: {
    viewport: { defaultViewport: 'phone' },
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
  args: { ticket: freeTicket, publicFreeTicketIds: [4822] },
}
