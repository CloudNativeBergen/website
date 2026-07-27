import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'

import { defaultBudgetSeed } from '@/lib/budget/defaults'
import type { ConferenceBudgetDocument } from '@/lib/budget/types'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { BudgetPageClient } from './BudgetPageClient'

const budget: ConferenceBudgetDocument = {
  ...defaultBudgetSeed(),
  _id: 'budget-story',
  conference: { _ref: 'conf-story' },
}

// A few recorded expense actuals so the Actual column has content.
budget.fixedCosts = budget.fixedCosts?.map((cost) =>
  cost._key === 'venue-conference'
    ? { ...cost, actualAmount: 109500 }
    : cost._key === 'print'
      ? { ...cost, actualAmount: 38200 }
      : cost,
)

const sponsorIncome = {
  byCurrency: [
    {
      currency: 'NOK',
      signedRevenue: 350000,
      paidRevenue: 225000,
      openPipelineRevenue: 125000,
    },
  ],
  signedCount: 14,
  totalSponsors: 23,
}

const ticketIncome = {
  source: 'live' as const,
  ticketCount: 187,
  orderCount: 149,
  revenue: 412680,
  categoryCounts: {
    'Conference - Early Bird': 25,
    'Conference - Standard': 92,
    'Conference + Workshop - Standard': 45,
    Student: 5,
    'Sponsor Discount (20%)': 20,
  },
}

const handlers = [
  http.post('/api/trpc/budget.updateExpenses', () =>
    HttpResponse.json({
      result: { data: { success: true, budget } },
    }),
  ),
  http.post('/api/trpc/budget.updateTicketTypes', () =>
    HttpResponse.json({
      result: { data: { success: true, budget } },
    }),
  ),
  http.post('/api/trpc/budget.create', () =>
    HttpResponse.json({ result: { data: { budget } } }),
  ),
]

const meta = {
  title: 'Systems/Budget/Admin/BudgetPage',
  component: BudgetPageClient,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Admin budget page (budget module M1): scenario projections (ported from the CloudNativeBergen/budget generator) against live sponsor-pipeline and ticketing income, expenses by category with optional-cost flags, and a margin readout.',
      },
    },
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
              <div className="min-h-screen bg-gray-50 p-4 sm:p-6 dark:bg-gray-900">
                <div className="mx-auto max-w-6xl">
                  <Story />
                </div>
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof BudgetPageClient>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { budget, sponsorIncome, ticketIncome },
}

export const Dark: Story = {
  args: { budget, sponsorIncome, ticketIncome },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const ManualTicketCounts: Story = {
  args: {
    budget: {
      ...budget,
      ticketTypes: budget.ticketTypes?.map((t) =>
        t._key === 'conf-standard' ? { ...t, actualCount: 60 } : t,
      ),
    },
    sponsorIncome,
    ticketIncome: {
      source: 'manual',
      ticketCount: 60,
      orderCount: 0,
      revenue: 150000,
      categoryCounts: { 'Conference - Standard': 60 },
    },
  },
}

export const Empty: Story = {
  args: { budget: null, sponsorIncome, ticketIncome: null },
}

/**
 * Misconfigured sponsor-included flags: no ticket type is flagged, so the
 * derived sponsor tickets have no row to land on — the model surfaces an
 * explicit warning instead of silently undercounting headcounts.
 */
export const SponsorIncludedMisconfigured: Story = {
  args: {
    budget: {
      ...budget,
      ticketTypes: budget.ticketTypes?.map((t) =>
        t.sponsorIncluded ? { ...t, sponsorIncluded: false } : t,
      ),
    },
    sponsorIncome,
    ticketIncome,
  },
}

/**
 * Sponsor deals signed in several currencies: per-currency sums render
 * separately with a mixed-currencies note — they are never collapsed into
 * one NOK figure, and only the NOK share enters combined totals.
 */
export const MixedCurrencySponsorIncome: Story = {
  args: {
    budget,
    sponsorIncome: {
      byCurrency: [
        {
          currency: 'NOK',
          signedRevenue: 275000,
          paidRevenue: 225000,
          openPipelineRevenue: 125000,
        },
        {
          currency: 'USD',
          signedRevenue: 10000,
          paidRevenue: 0,
          openPipelineRevenue: 5000,
        },
      ],
      signedCount: 15,
      totalSponsors: 24,
    },
    ticketIncome,
  },
}
