'use client'

import { useMemo } from 'react'
import type {
  TravelExpense,
  SupportedCurrency,
} from '@/lib/travel-support/types'
import { useExchangeRates } from '@/hooks/useExchangeRates'

interface ExpenseSummaryProps {
  expenses: TravelExpense[]
  preferredCurrency: SupportedCurrency
}

export function ExpenseSummary({
  expenses,
  preferredCurrency,
}: ExpenseSummaryProps) {
  const {
    exchangeRates,
    isLoading: ratesLoading,
    error: ratesError,
    convertCurrency,
  } = useExchangeRates()
  const summary = useMemo(() => {
    const approved = expenses.filter((expense) => expense.status === 'approved')
    const pending = expenses.filter((expense) => expense.status === 'pending')
    const rejected = expenses.filter((expense) => expense.status === 'rejected')

    const calculateTotal = (expenseList: TravelExpense[]) => {
      return expenseList.reduce((total, expense) => {
        const convertedAmount = convertCurrency(
          expense.amount,
          expense.currency,
          preferredCurrency,
        )
        return total + convertedAmount
      }, 0)
    }

    const approvedTotal = calculateTotal(approved)
    const pendingTotal = calculateTotal(pending)
    const rejectedTotal = calculateTotal(rejected)
    const grandTotal = approvedTotal + pendingTotal

    // Currency breakdown
    const currencyBreakdown = expenses.reduce(
      (breakdown, expense) => {
        const currency = expense.currency
        if (!breakdown[currency]) {
          breakdown[currency] = { approved: 0, pending: 0, rejected: 0 }
        }
        breakdown[currency][expense.status] += expense.amount
        return breakdown
      },
      {} as Record<
        SupportedCurrency,
        { approved: number; pending: number; rejected: number }
      >,
    )

    return {
      approved: { count: approved.length, total: approvedTotal },
      pending: { count: pending.length, total: pendingTotal },
      rejected: { count: rejected.length, total: rejectedTotal },
      grandTotal,
      currencyBreakdown,
    }
  }, [expenses, preferredCurrency, convertCurrency])

  const formatCurrency = (
    amount: number,
    currency: SupportedCurrency = preferredCurrency,
  ) => {
    if (currency === 'OTHER') {
      return amount.toFixed(2)
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  // Show loading state while exchange rates are loading
  if (ratesLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Expense Summary
        </h3>
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-24 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    )
  }

  // Show error state if exchange rates failed to load
  if (ratesError) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-6 shadow-sm dark:border-red-700 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Expense Summary
        </h3>
        <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/10">
          <div className="text-sm text-red-700 dark:text-red-300">
            <p className="font-medium">Unable to load current exchange rates</p>
            <p className="mt-1">
              Using fallback rates. Amounts may not be accurate.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800/50">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No expenses submitted yet.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Expense Summary
      </h3>

      {/* Status Totals */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(summary.approved.total)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Approved ({summary.approved.count})
          </div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {formatCurrency(summary.pending.total)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Pending ({summary.pending.count})
          </div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {formatCurrency(summary.rejected.total)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Rejected ({summary.rejected.count})
          </div>
        </div>
      </div>

      {/* Grand Total */}
      <div className="border-t border-gray-200 pt-4 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            Total Reimbursable:
          </span>
          <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {formatCurrency(summary.grandTotal)}
          </span>
        </div>
        {preferredCurrency !== 'OTHER' && (
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {(() => {
              // Get unique currencies used in expenses (excluding the preferred currency)
              const usedCurrencies = Array.from(
                new Set(
                  expenses
                    .map((expense) => expense.currency)
                    .filter(
                      (currency) =>
                        currency !== preferredCurrency && currency !== 'OTHER',
                    ),
                ),
              )

              if (usedCurrencies.length === 0) {
                return <p>All expenses in {preferredCurrency}</p>
              }

              if (usedCurrencies.length === 1 && exchangeRates) {
                const fromCurrency = usedCurrencies[0]
                const rate = exchangeRates[fromCurrency]?.[preferredCurrency]
                return (
                  <p>
                    Converted at 1 {fromCurrency} = {rate?.toFixed(4) || 'N/A'}{' '}
                    {preferredCurrency} (live rates)
                  </p>
                )
              }

              return (
                <p>
                  Converted to {preferredCurrency} using live exchange rates
                </p>
              )
            })()}
          </div>
        )}
      </div>

      {/* Currency Breakdown */}
      {Object.keys(summary.currencyBreakdown).length > 1 && (
        <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-600">
          <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
            Original Currency Breakdown:
          </h4>
          <div className="space-y-2">
            {(
              Object.entries(summary.currencyBreakdown) as [
                SupportedCurrency,
                { approved: number; pending: number; rejected: number },
              ][]
            ).map(([currency, amounts]) => {
              const total = amounts.approved + amounts.pending
              if (total === 0) return null

              return (
                <div key={currency} className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">
                    {currency}:
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(total, currency)}
                    {amounts.approved > 0 && amounts.pending > 0 && (
                      <span className="ml-1 text-gray-500">
                        ({formatCurrency(amounts.approved, currency)} approved +{' '}
                        {formatCurrency(amounts.pending, currency)} pending)
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
