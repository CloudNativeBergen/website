'use client'

import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import {
  TravelSupportWithExpenses,
  TravelExpense,
  ExpenseStatus,
  SupportedCurrency,
} from '@/lib/travel-support/types'
import { TravelSupportService } from '@/lib/travel-support/service'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { formatConferenceDateLong } from '@/lib/time'

interface ApprovalSummaryProps {
  travelSupport: TravelSupportWithExpenses
}

export function ApprovalSummary({ travelSupport }: ApprovalSummaryProps) {
  const { convertCurrency } = useExchangeRates()
  const isPaid = travelSupport.status === 'paid'
  const isApproved = travelSupport.status === 'approved' || isPaid

  if (!isApproved) {
    return null
  }

  const expenses = travelSupport.expenses || []
  const approvedExpenses = expenses.filter(
    (expense) => expense.status === ExpenseStatus.APPROVED,
  )
  const rejectedExpenses = expenses.filter(
    (expense) => expense.status === ExpenseStatus.REJECTED,
  )

  const preferredCurrency = travelSupport.bankingDetails.preferredCurrency

  const calculateTotalInCurrency = (
    expenseList: TravelExpense[],
    currency: SupportedCurrency,
  ) => {
    return expenseList.reduce((total, expense) => {
      const convertedAmount = convertCurrency(
        expense.amount,
        expense.currency,
        currency,
      )
      return total + convertedAmount
    }, 0)
  }

  const approvedTotalNOK = calculateTotalInCurrency(approvedExpenses, 'NOK')
  const approvedTotalPreferred = calculateTotalInCurrency(
    approvedExpenses,
    preferredCurrency,
  )

  const formatCurrency = (
    amount: number,
    currency: SupportedCurrency = preferredCurrency,
  ) => {
    if (currency === 'OTHER') {
      return amount.toFixed(2)
    }
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const showPaymentInfo = isApproved && travelSupport.expectedPaymentDate

  return (
    <div className="space-y-6">
      {/* Main Approval Status */}
      <div className="rounded-lg border-2 border-green-200 bg-linear-to-br from-green-50 to-emerald-50 p-6 shadow-sm dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/20">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/50">
            {isPaid ? (
              <BanknotesIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            ) : (
              <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-green-900 dark:text-green-100">
              {isPaid ? 'Payment Completed' : 'Travel Support Request Approved'}
            </h3>
            <p className="mt-1 text-green-700 dark:text-green-300">
              {isPaid
                ? 'Your travel support has been paid out.'
                : 'Your travel support request has been reviewed and approved.'}
            </p>

            {/* Approved Amount */}
            <div className="mt-4 rounded-lg bg-white/80 p-4 dark:bg-gray-900/50">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Approved Amount:
                </span>
                <div className="text-right">
                  <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(approvedTotalPreferred, preferredCurrency)}
                  </span>
                  {preferredCurrency !== 'NOK' && (
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      ({formatCurrency(approvedTotalNOK, 'NOK')})
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Payment Timeline */}
            {showPaymentInfo && (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                <CalendarDaysIcon className="h-5 w-5" />
                <span>
                  {isPaid ? (
                    <>
                      Paid on{' '}
                      {travelSupport.paidAt
                        ? formatConferenceDateLong(
                            travelSupport.paidAt.split('T')[0],
                          )
                        : 'Recently'}
                    </>
                  ) : (
                    <>
                      Expected payment date:{' '}
                      {travelSupport.expectedPaymentDate
                        ? formatConferenceDateLong(
                            travelSupport.expectedPaymentDate,
                          )
                        : 'To be determined'}
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Admin Notes */}
            {travelSupport.reviewNotes && (
              <div className="mt-4 rounded-lg border border-green-200 bg-white/60 p-3 dark:border-green-800 dark:bg-gray-900/30">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <DocumentTextIcon className="h-4 w-4" />
                  Notes from organizers:
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {travelSupport.reviewNotes}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expense Breakdown */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Expense Review Summary
        </h4>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Approved Expenses */}
          <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-900/10">
            <div className="mb-2 flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircleIcon className="h-5 w-5" />
              <span className="font-semibold">
                Approved ({approvedExpenses.length})
              </span>
            </div>
            <div className="space-y-2">
              {approvedExpenses.map((expense) => (
                <div
                  key={expense._id}
                  className="flex items-start justify-between text-sm"
                >
                  <span className="text-gray-700 dark:text-gray-300">
                    {expense.description}
                  </span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    {TravelSupportService.formatCurrency(
                      expense.amount,
                      expense.currency,
                      expense.customCurrency,
                    )}
                  </span>
                </div>
              ))}
              {approvedExpenses.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No expenses approved
                </p>
              )}
            </div>
          </div>

          {/* Rejected Expenses */}
          {rejectedExpenses.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-900/10">
              <div className="mb-2 flex items-center gap-2 text-red-700 dark:text-red-400">
                <XCircleIcon className="h-5 w-5" />
                <span className="font-semibold">
                  Not Approved ({rejectedExpenses.length})
                </span>
              </div>
              <div className="space-y-2">
                {rejectedExpenses.map((expense) => (
                  <div key={expense._id} className="text-sm">
                    <div className="flex items-start justify-between">
                      <span className="text-gray-700 dark:text-gray-300">
                        {expense.description}
                      </span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-white">
                        {TravelSupportService.formatCurrency(
                          expense.amount,
                          expense.currency,
                          expense.customCurrency,
                        )}
                      </span>
                    </div>
                    {expense.reviewNotes && (
                      <p className="mt-1 text-xs text-red-600 italic dark:text-red-400">
                        Reason: {expense.reviewNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Expenses (shouldn't happen but defensive) */}
          {expenses.some((e) => e.status === ExpenseStatus.PENDING) && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50/50 p-4 dark:border-yellow-800 dark:bg-yellow-900/10">
              <div className="mb-2 flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                <ClockIcon className="h-5 w-5" />
                <span className="font-semibold">
                  Still Under Review (
                  {
                    expenses.filter((e) => e.status === ExpenseStatus.PENDING)
                      .length
                  }
                  )
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Some expenses are still being reviewed.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Next Steps */}
      {!isPaid && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-start gap-3">
            <ClockIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="flex-1">
              <h5 className="font-semibold text-blue-900 dark:text-blue-100">
                What happens next?
              </h5>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                {travelSupport.expectedPaymentDate
                  ? `The approved amount will be transferred to your bank account around ${formatConferenceDateLong(travelSupport.expectedPaymentDate)}. You will receive a notification once the payment has been processed.`
                  : 'The approved amount will be transferred to your bank account soon. You will receive a notification once the payment has been processed.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
