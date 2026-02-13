import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Systems/Speakers/TravelSupport/ExpenseSummary',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Expense summary card showing approved, pending, and rejected totals with currency conversion. Uses `useExchangeRates` hook — stories use a mock wrapper that renders the summary UI directly with pre-computed values.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function MockExpenseSummary({
  approved,
  pending,
  rejected,
  grandTotal,
  currency = 'NOK',
  showBreakdown = false,
}: {
  approved: { count: number; total: number }
  pending: { count: number; total: number }
  rejected: { count: number; total: number }
  grandTotal: number
  currency?: string
  showBreakdown?: boolean
}) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Expense Summary
      </h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Approved ({approved.count})
          </div>
          <div className="text-base font-bold text-green-600 dark:text-green-400">
            {formatCurrency(approved.total).replace(/\s/g, '\u00A0')}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Pending ({pending.count})
          </div>
          <div className="text-base font-bold text-yellow-600 dark:text-yellow-400">
            {formatCurrency(pending.total).replace(/\s/g, '\u00A0')}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Rejected ({rejected.count})
          </div>
          <div className="text-base font-bold text-red-600 dark:text-red-400">
            {formatCurrency(rejected.total).replace(/\s/g, '\u00A0')}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-600">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Total:
          </span>
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
            {formatCurrency(grandTotal).replace(/\s/g, '\u00A0')}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {showBreakdown ? (
            <p>Converted to {currency} using live exchange rates</p>
          ) : (
            <p>All expenses in {currency}</p>
          )}
        </div>
      </div>

      {showBreakdown && (
        <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-600">
          <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
            Original Currency Breakdown:
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">NOK:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                kr 3,650.00
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">GBP:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                £1,850.00
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">EUR:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                €80.00
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <MockExpenseSummary
      approved={{ count: 2, total: 5050 }}
      pending={{ count: 2, total: 2300 }}
      rejected={{ count: 1, total: 450 }}
      grandTotal={7350}
    />
  ),
}

export const AllApproved: Story = {
  render: () => (
    <MockExpenseSummary
      approved={{ count: 4, total: 7800 }}
      pending={{ count: 0, total: 0 }}
      rejected={{ count: 0, total: 0 }}
      grandTotal={7800}
    />
  ),
}

export const MultipleCurrencies: Story = {
  render: () => (
    <MockExpenseSummary
      approved={{ count: 2, total: 5050 }}
      pending={{ count: 2, total: 2300 }}
      rejected={{ count: 1, total: 450 }}
      grandTotal={7350}
      showBreakdown
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'When expenses span multiple currencies, an original currency breakdown section is shown below the totals.',
      },
    },
  },
}

export const Empty: Story = {
  render: () => (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800/50">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No expenses submitted yet.
      </p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Empty state when no expenses have been submitted.',
      },
    },
  },
}
