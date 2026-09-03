import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/_app'
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
 *    zero, while the VENDOR's own `times` counter disagrees (7 and 19). No
 *    notice, and the zeros are shown: the pre-fix panel rendered the vendor's
 *    numbers here under a warning badge, so this story looks different from
 *    the old build rather than merely differently worded. It is the one that
 *    used to be wrong.
 *  - `WithRedemptions`  — `usageStatus: 'resolved'` with real counts.
 *  - `UsageUnavailable` — `usageStatus: 'unavailable'`, `actualUsage` OMITTED.
 *    One notice above BOTH tables (both sections' numbers change source), and
 *    every count labelled "Checkin.no count" because it is the vendor's own
 *    `times` counter, not ours.
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

/** Long tier titles, all entitled — the case the tier label has to survive. */
const LONG_TIER_SPONSORS = [
  ['Stacc', 'stacc.example'],
  ['Bergen Bytes', 'bytes.example'],
  ['Cirrus Systems', 'cirrus.example'],
].map(([name, host], index) => ({
  id: `sponsor-long-${index}`,
  name,
  website: `https://${host}/`,
  tier: {
    title: 'Community Partner Package',
    tagline: 'Community partner',
    tierType: 'standard' as const,
  },
  ticketEntitlement: 2,
}))

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

/**
 * Typed against the REAL procedure output so a story cannot quietly describe a
 * payload the server can no longer produce.
 */
type UsagePayload =
  inferRouterOutputs<AppRouter>['tickets']['admin']['getDiscountCodesWithUsage']

const payload = (
  usageStatus: 'resolved' | 'unavailable',
  usage: Record<string, { usageCount: number; times: number }>,
): UsagePayload => ({
  success: true,
  discounts: discounts(usage, usageStatus === 'resolved'),
  ticketTypes,
  // `null` on a failed read: we did not count zero tickets, we failed to count.
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
  args: {
    sponsors: SPONSORS,
    eventId: 4242,
    providerLabel: 'Checkin.no',
    conference,
    defaultCustomDiscountsExpanded: true,
  },
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
 * Vendor counters that DISAGREE with our derived zero. With them at zero the
 * story below would render the same numbers as the pre-fix panel and differ
 * only in wording, which is worthless as a visual record.
 */
const ZERO_REDEMPTIONS = {
  ACMECLOUD1234: { usageCount: 0, times: 7 },
  EARLYBIRD: { usageCount: 0, times: 19 },
}

/**
 * THE REGRESSION STORY. Codes are live, the ticket read succeeded, nobody has
 * redeemed anything yet — so every count reads 0 with NO notice and NO
 * "Checkin.no count" hint. The pre-fix panel showed 7 and 19 here, under a
 * yellow "Usage data unavailable" badge.
 */
export const NoRedemptionsYet: Story = {
  parameters: { msw: { handlers: handlersFor('resolved', ZERO_REDEMPTIONS) } },
}

export const NoRedemptionsYetDark: Story = {
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    msw: { handlers: handlersFor('resolved', ZERO_REDEMPTIONS) },
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

/**
 * THE STATE THE OWNER HIT ON HIS PHONE, and the reason this file gained
 * stories at all.
 *
 * Every sponsor's tier includes no complimentary tickets, so every `+` is
 * correctly disabled. Before the fix that was signalled by `disabled:opacity-50`
 * and nothing else — imperceptible on a muted grey icon over a dark card, with
 * no `cursor-not-allowed` to react on hover and no hover at all on a touch
 * device. The control was indistinguishable from a dead div, which is exactly
 * how it was reported.
 *
 * What to look for here: each disabled `+` is preceded by visible text naming
 * the tier that grants nothing ("The Community tier includes no tickets"), so
 * the reason survives on a phone. Compare against `NoRedemptionsYet`, where the
 * same button is live.
 *
 * NOBODY HAS LOOKED AT THE PIXELS OF THIS STORY. Playwright is broken on the
 * primary dev machine (`pnpm shoot` cannot run), so this was reasoned about in
 * code and pinned by `DiscountCodeManager.entitlement.test.tsx` — not seen. The
 * dark variant below matters precisely because the dark background is where the
 * old signal disappeared, and it is the one nobody has verified visually.
 */
const UNENTITLED_SPONSORS = [
  {
    id: 'sponsor-community',
    name: 'Nordic Community Hub',
    website: 'https://community.example',
    tier: {
      title: 'Community',
      tagline: 'Community partner',
      tierType: 'special' as const,
    },
    ticketEntitlement: 0,
  },
  {
    id: 'sponsor-barista',
    name: 'Bergen Roasters',
    website: 'https://roasters.example',
    tier: {
      title: 'Barista Bar Sponsorship',
      tagline: 'Add-on',
      tierType: 'special' as const,
    },
    ticketEntitlement: 0,
  },
]

/** No sponsor can be issued a code. Every `+` is disabled and says why. */
export const NoTicketEntitlement: Story = {
  args: { sponsors: UNENTITLED_SPONSORS },
  parameters: { msw: { handlers: handlersFor('resolved', {}) } },
}

/** The dark background on which `disabled:opacity-50` alone was invisible. */
export const NoTicketEntitlementDark: Story = {
  args: { sponsors: UNENTITLED_SPONSORS },
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    msw: { handlers: handlersFor('resolved', {}) },
  },
}

/**
 * MIXED — the discrimination the fix turns on. Two sponsors are entitled and
 * two are not, in one table, so the live `+` and the blocked `+` sit side by
 * side. If the disabled state is still mute, this is the story where that is
 * obvious: the four rows would look identical.
 */
export const MixedEntitlement: Story = {
  args: { sponsors: [...SPONSORS, ...UNENTITLED_SPONSORS] },
  parameters: { msw: { handlers: handlersFor('resolved', {}) } },
}

/**
 * The OTHER disabled case, kept visually distinct from the blocked one: a
 * create is in flight for Acme Cloud, so its button shows a spinner and NO
 * reason text — it re-enables itself. The two were previously collapsed into
 * one `disabled` expression and looked the same.
 *
 * Driven by a play function because `loading` is internal state; the create
 * handler never resolves, so the story parks in the busy state.
 */
export const CreateInFlight: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/tickets.admin.getDiscountCodesWithUsage', () =>
          HttpResponse.json({ result: { data: payload('resolved', {}) } }),
        ),
        http.post(
          '/api/trpc/tickets.admin.createDiscountCode',
          () => new Promise(() => {}),
        ),
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    const buttons = await canvas.findAllByRole('button', {
      name: /create discount code for Acme Cloud/i,
    })
    await userEvent.click(buttons[0])
  },
}

/**
 * The row shape the owner reported: a long tier title next to a multi-select
 * whose choice is the same for every sponsor. The title is plain text rather
 * than a pill (a pill wraps into a fat lozenge at this column width), and the
 * dropdown carries "Apply to all sponsors" so the choice is made once.
 */
export const ApplyTicketTypesToAll: Story = {
  args: { sponsors: LONG_TIER_SPONSORS },
  parameters: { msw: { handlers: handlersFor('resolved', {}) } },
}

export const ApplyTicketTypesToAllDark: Story = {
  args: { sponsors: LONG_TIER_SPONSORS },
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    msw: { handlers: handlersFor('resolved', {}) },
  },
}

/** The same table with one row's menu open, showing the bulk action. */
export const ApplyTicketTypesToAllOpenDark: Story = {
  args: { sponsors: LONG_TIER_SPONSORS },
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    msw: { handlers: handlersFor('resolved', {}) },
  },
  play: async ({ canvas, userEvent }) => {
    const triggers = await canvas.findAllByRole('button', {
      name: /Conference Pass/,
    })
    await userEvent.click(triggers[triggers.length - 1])
  },
}
