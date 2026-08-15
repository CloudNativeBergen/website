import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { DiscountCodeManager } from './DiscountCodeManager'
import { NotificationProvider } from './NotificationProvider'

/**
 * The discount panel's THREE usage states, which used to be two.
 *
 * `getDiscountCodesWithUsage` derives redemption counts by scanning the event's
 * tickets. Until this fix, a successful scan that found no redemptions was
 * reported with the same payload as a scan that never ran, so a conference on
 * day one of ticket sales saw a yellow "usage data unavailable" badge over
 * numbers that were available and simply zero.
 *
 * The stories below are the observable difference:
 *
 *  - `NoRedemptionsYet` — `usageStatus: 'resolved'`, every `actualUsage` at
 *    zero. NO badge. This is the one that used to be wrong.
 *  - `WithRedemptions`  — `usageStatus: 'resolved'` with real counts.
 *  - `UsageUnavailable` — `usageStatus: 'unavailable'`, `actualUsage` OMITTED.
 *    Badge plus an explanation, and every count labelled "provider count"
 *    because it is the vendor's own `times` counter, not ours.
 *
 * (Playwright is unusable on the primary dev machine, so these stories — not a
 * local screenshot — are the visual record. They render in CI's published
 * Storybook.)
 */

const SPONSORS = [
  {
    id: 'sponsor-acme',
    name: 'Acme Cloud',
    website: 'https://acme.example',
    tier: {
      title: 'Gold',
      tagline: 'Headline partner',
      tierType: 'standard' as const,
    },
    ticketEntitlement: 5,
  },
  {
    id: 'sponsor-globex',
    name: 'Globex',
    website: 'https://globex.example',
    tier: {
      title: 'Silver',
      tagline: 'Supporting partner',
      tierType: 'standard' as const,
    },
    ticketEntitlement: 3,
  },
]

const baseDiscount = {
  trigger: 'coupon',
  type: 'percentage',
  affects: 'total',
  includeBooking: false,
  affectsValue: null,
  modes: [],
  tickets: ['1'],
  ticketsOnly: true,
}

/** One sponsor code (matched by name) and one general promotion. */
const discounts = (
  usage: Record<string, { usageCount: number; times: number }>,
  withUsage: boolean,
) =>
  [
    { id: 'd1', triggerValue: 'ACMECLOUD1234', value: '100', timesTotal: 5 },
    { id: 'd2', triggerValue: 'EARLYBIRD', value: '20', timesTotal: 50 },
  ].map((d) => ({
    ...baseDiscount,
    ...d,
    // Checkin's OWN counter — always present on the code itself.
    times: usage[d.triggerValue]?.times ?? 0,
    // OURS — present only when the ticket read resolved.
    ...(withUsage
      ? {
          actualUsage: {
            usageCount: usage[d.triggerValue]?.usageCount ?? 0,
            ticketIds: [],
            totalPaid: 0,
          },
        }
      : {}),
  }))

const ticketTypes = [
  { id: 1, name: 'Conference Pass', description: null },
  { id: 2, name: 'Workshop Pass', description: null },
]

const payload = (
  usageStatus: 'resolved' | 'unavailable',
  usage: Record<string, { usageCount: number; times: number }>,
) => ({
  success: true,
  discounts: discounts(usage, usageStatus === 'resolved'),
  ticketTypes,
  usageStats: {},
  totalTickets: usageStatus === 'resolved' ? 120 : null,
  count: 2,
  usageStatus,
  conferenceInfo: { customerId: 7, eventId: 4242, title: 'Konf 2026' },
})

const handlersFor = (
  usageStatus: 'resolved' | 'unavailable',
  usage: Record<string, { usageCount: number; times: number }> = {},
) => [
  http.get('/api/trpc/tickets.admin.getDiscountCodesWithUsage', () =>
    HttpResponse.json({ result: { data: payload(usageStatus, usage) } }),
  ),
  http.post('/api/trpc/tickets.admin.createDiscountCode', () =>
    HttpResponse.json({ result: { data: { discountCode: 'NEWCODE' } } }),
  ),
  http.post('/api/trpc/tickets.admin.deleteDiscountCode', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const conference = {
  title: 'Konf 2026',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-09-10',
  domains: ['konf.example'],
  contactEmail: 'organizers@konf.example',
  domain: 'konf.example',
}

const meta = {
  title: 'Systems/Sponsors/Admin/DiscountCodeManager',
  component: DiscountCodeManager,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sponsor and custom discount codes, with the three usage states: a resolved read with no redemptions yet, a resolved read with redemptions, and a ticket read that failed (where every number falls back to the provider’s own counter and is labelled as such).',
      },
    },
  },
  args: { sponsors: SPONSORS, eventId: 4242, conference },
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
              <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof DiscountCodeManager>

export default meta
type Story = StoryObj<typeof meta>

/**
 * THE REGRESSION STORY. Codes are live, the ticket read succeeded, nobody has
 * redeemed anything yet. There must be NO yellow badge and no "provider count"
 * hint — every zero here is a zero we counted.
 */
export const NoRedemptionsYet: Story = {
  parameters: { msw: { handlers: handlersFor('resolved') } },
}

export const NoRedemptionsYetDark: Story = {
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    msw: { handlers: handlersFor('resolved') },
  },
}

/** A resolved read with real redemptions: our counts, no source hint. */
export const WithRedemptions: Story = {
  parameters: {
    msw: {
      handlers: handlersFor('resolved', {
        ACMECLOUD1234: { usageCount: 3, times: 3 },
        EARLYBIRD: { usageCount: 18, times: 19 },
      }),
    },
  },
}

/**
 * The ticket read FAILED. The organizer is told so in words, and each number is
 * marked as the ticket provider's own redemption counter — not called an
 * "estimate", which is what the old copy did to the more authoritative of the
 * two numbers.
 */
export const UsageUnavailable: Story = {
  parameters: {
    msw: {
      handlers: handlersFor('unavailable', {
        ACMECLOUD1234: { usageCount: 0, times: 2 },
        EARLYBIRD: { usageCount: 0, times: 11 },
      }),
    },
  },
}

export const UsageUnavailableDark: Story = {
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    msw: {
      handlers: handlersFor('unavailable', {
        ACMECLOUD1234: { usageCount: 0, times: 2 },
        EARLYBIRD: { usageCount: 0, times: 11 },
      }),
    },
  },
}
