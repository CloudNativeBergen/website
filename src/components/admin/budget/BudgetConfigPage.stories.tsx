import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'

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
