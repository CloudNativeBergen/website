import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, userEvent, within } from 'storybook/test'

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
  http.post('/api/trpc/budget.updateSponsorAssumptions', () =>
    HttpResponse.json({
      result: { data: { success: true, budget } },
    }),
  ),
  http.post('/api/trpc/budget.updateConfig', () =>
    HttpResponse.json({
      result: { data: { success: true, budget } },
    }),
  ),
  http.post('/api/trpc/budget.updateScenarios', () =>
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

/**
 * Editing state: the ticket-type and expense cards toggled into their inline
 * spreadsheet tables (one row per line item, cells edit in place). Drives the
 * "Edit" affordance so the wide-table editing surface is captured for review.
 */
export const EditingTables: Story = {
  args: { budget, sponsorIncome, ticketIncome },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: /edit ticket types/i }),
    )
    await userEvent.click(
      await canvas.findByRole('button', { name: /edit expenses/i }),
    )
    // The spreadsheet inputs are now on the page (one name field per row).
    await canvas.findAllByRole('textbox', { name: /ticket type name/i })
  },
}

/**
 * Reference-aware delete guard on the sponsor assumptions editor: the seeded
 * scenarios reference the "Community Partner" tier, so a first delete click
 * only arms a confirm (row stays, amber hint shows) — the same two-click guard
 * the ticket-type and expense editors use — and a second click removes it.
 */
export const SponsorDeleteGuard: Story = {
  args: { budget, sponsorIncome, ticketIncome },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: /edit assumptions/i }),
    )
    const del = await canvas.findByRole('button', {
      name: /^Remove Community Partner$/i,
    })
    await userEvent.click(del)
    // First click only arms the confirm: the row is still present and the
    // guard affordance appears.
    await expect(
      await canvas.findByRole('button', {
        name: /Confirm removing Community Partner/i,
      }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText(/referenced by a scenario/i),
    ).toBeInTheDocument()
    await expect(
      canvas.getByDisplayValue('Community Partner'),
    ).toBeInTheDocument()
    // Second click confirms the removal.
    await userEvent.click(
      canvas.getByRole('button', {
        name: /Confirm removing Community Partner/i,
      }),
    )
    await expect(
      canvas.queryByDisplayValue('Community Partner'),
    ).not.toBeInTheDocument()
  },
}

/**
 * Regression net for the section collapse (task 1): clicking the Income
 * section's Hide toggle collapses ONLY that section — its body unmounts and
 * `aria-expanded` flips to false — while Expenses stays open independently.
 */
export const CollapseIncome: Story = {
  args: { budget, sponsorIncome, ticketIncome },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggles = await canvas.findAllByRole('button', { expanded: true })
    const incomeToggle = toggles.find((b) => /Income/.test(b.textContent ?? ''))
    if (!incomeToggle) throw new Error('Income toggle not found')
    await userEvent.click(incomeToggle)
    await expect(incomeToggle).toHaveAttribute('aria-expanded', 'false')
    // Expenses remains open — the two sections collapse independently.
    const stillOpen = await canvas.findAllByRole('button', { expanded: true })
    await expect(
      stillOpen.some((b) => /Expenses/.test(b.textContent ?? '')),
    ).toBe(true)
  },
}
