import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { defaultBudgetSeed } from '@/lib/budget/defaults'
import type { ConferenceBudgetDocument } from '@/lib/budget/types'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { BudgetConfigPageClient } from './BudgetConfigPageClient'

const budget: ConferenceBudgetDocument = {
  ...defaultBudgetSeed(),
  _id: 'budget-story',
  conference: { _ref: 'conf-story' },
}

const handlers = [
  http.post('/api/trpc/budget.updateConfig', () =>
    HttpResponse.json({ result: { data: { success: true, budget } } }),
  ),
  http.post('/api/trpc/budget.updateScenarios', () =>
    HttpResponse.json({ result: { data: { success: true, budget } } }),
  ),
]

const meta = {
  title: 'Systems/Budget/Admin/BudgetConfigPage',
  component: BudgetConfigPageClient,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Budget configuration sub-page (/admin/budget/config): scalar global parameters (VAT / ticketing-fee rates, dinner-participation model) as a labeled form, plus the per-scenario ticket / tier / add-on quantity editor and optional-cost cut flags. The non-tabular config that does not belong in the main page inline tables.',
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
} satisfies Meta<typeof BudgetConfigPageClient>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { budget },
}

export const Dark: Story = {
  args: { budget },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/**
 * Percent inputs are capped: they carry `max=100` and a > 100 entry is
 * blocked client-side with a clear message (the server only accepts fractions
 * ≤ 1 after the /100 conversion), instead of surfacing a confusing
 * "enter as a fraction" error on save.
 */
export const PercentCapped: Story = {
  args: { budget },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const vat = await canvas.findByRole('spinbutton', { name: /VAT rate/i })
    await expect(vat).toHaveAttribute('max', '100')
    await expect(
      canvas.getByRole('spinbutton', { name: /Ticketing fee/i }),
    ).toHaveAttribute('max', '100')

    await userEvent.clear(vat)
    await userEvent.type(vat, '150')
    await userEvent.click(
      canvas.getByRole('button', { name: /save parameters/i }),
    )
    await expect(
      await canvas.findByText(/VAT rate must be between 0 and 100%/i),
    ).toBeInTheDocument()
  },
}

/**
 * After saving, the form re-seeds from the persisted document (via
 * `budgetToGlobals` → `toPercent`), so the dirty flag clears — the Save button
 * returns to disabled instead of staying stuck on. This is what normalizes
 * equivalent percent strings ("4.50" ≡ "4.5") that would otherwise leave the
 * button enabled forever.
 */
export const GlobalsDirtyNormalizes: Story = {
  args: { budget },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const fee = await canvas.findByRole('spinbutton', {
      name: /Ticketing fee/i,
    })
    await userEvent.clear(fee)
    await userEvent.type(fee, '4.6')
    const save = canvas.getByRole('button', { name: /save parameters/i })
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    // Once the save resolves, local state re-seeds from the persisted budget
    // and the dirty flag clears, so the button disables again.
    await waitFor(() => expect(save).toBeDisabled())
  },
}

/**
 * Saving scenarios re-seeds local state from the persisted document (whose
 * `_key`s `updateScenarios` may have normalized), so the dirty flag clears and
 * later edits target the persisted keys — the Save button disables after save.
 */
export const ScenarioKeysRefresh: Story = {
  args: { budget },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = await canvas.findByDisplayValue('Conservative')
    await userEvent.type(name, ' (edited)')
    const save = canvas.getByRole('button', { name: /save scenarios/i })
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() => expect(save).toBeDisabled())
  },
}
