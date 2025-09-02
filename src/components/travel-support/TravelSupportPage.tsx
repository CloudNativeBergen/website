'use client'

import { ExclamationTriangleIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useTravelSupport } from '@/hooks/useTravelSupport'
import { TravelSupportService } from '@/lib/travel-support/service'
import { BankingDetailsForm } from './BankingDetailsForm'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseSummary } from './ExpenseSummary'
import { ExchangeRateDebugPanel } from './ExchangeRateDebugPanel'
import { StatusBadge } from './StatusBadge'
import { ExpensesList } from './ExpensesList'
import { BankingDetailsDisplay } from './BankingDetailsDisplay'
import {
  LoadingState,
  CardSkeleton,
  BankingDetailsSkeleton,
} from './LoadingStates'
import { ErrorDisplay } from './ErrorComponents'
import { ErrorBoundary } from './ErrorBoundary'
import { usePerformanceMonitor } from '@/lib/travel-support/performance'

export function TravelSupportPage() {
  const { timeAsyncFunction } = usePerformanceMonitor()

  const {
    // Data
    travelSupport,
    isLoading,
    error,
    isEligible,
    canEdit,

    // State
    showBankingForm,
    showExpenseForm,
    editingExpense,
    setShowBankingForm,
    setShowExpenseForm,
    setEditingExpense,

    // Operations
    createTravelSupport,
    updateBankingDetails,
    addExpense,
    updateExpense,
    deleteExpense,
    deleteReceipt,
    submitTravelSupport,

    // Loading states
    isCreating,
    isUpdatingBanking,
    isAddingExpense,
    isUpdatingExpense,
    isSubmitting,

    // Errors
    createError,
    bankingError,
    expenseError,
    submitError,
  } = useTravelSupport()

  // Handlers
  const handleExpenseEdit = (expense: any) => {
    setEditingExpense(expense)
    setShowExpenseForm(true)
  }

  const handleExpenseCancel = () => {
    setEditingExpense(null)
    setShowExpenseForm(false)
  }

  const handleExpenseSave = async (expenseData: any) => {
    await timeAsyncFunction(
      editingExpense ? 'update-expense' : 'add-expense',
      async () => {
        if (editingExpense) {
          await updateExpense(editingExpense._id!, expenseData)
        } else {
          await addExpense(expenseData)
        }
      },
      {
        component: 'TravelSupportPage',
        action: editingExpense ? 'update' : 'add',
      },
    )
  }

  const handleExpenseDelete = async (expenseId: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      await timeAsyncFunction(
        'delete-expense',
        () => deleteExpense(expenseId),
        { component: 'TravelSupportPage', action: 'delete' },
      )
    }
  }

  const handleReceiptDelete = async (
    expenseId: string,
    receiptIndex: number,
  ) => {
    if (confirm('Are you sure you want to delete this receipt?')) {
      await timeAsyncFunction(
        'delete-receipt',
        () => deleteReceipt(expenseId, receiptIndex),
        { component: 'TravelSupportPage', action: 'delete-receipt' },
      )
    }
  }

  const handleSubmit = async () => {
    if (!travelSupport) return

    if (!TravelSupportService.canSubmit(travelSupport)) {
      alert(
        'Please add banking details and at least one expense before submitting.',
      )
      return
    }

    if (
      confirm(
        'Are you sure you want to submit your travel support request? You will not be able to make changes after submission.',
      )
    ) {
      await submitTravelSupport()
    }
  }

  // Loading state
  if (isLoading) {
    return <LoadingState message="Loading travel support..." />
  }

  // Error state
  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ErrorDisplay title="Failed to load travel support" message={error} />
      </div>
    )
  }

  // Not eligible
  if (!isEligible) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-900/20">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <ExclamationTriangleIcon className="h-6 w-6 text-amber-400 dark:text-amber-500" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Travel support not available
                </h3>
                <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  <p>
                    Travel support is only available for accepted speakers who
                    indicated they require funding assistance. If you believe
                    this is an error, please contact the organizers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No travel support created yet
  if (!travelSupport) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
            <svg
              className="h-8 w-8 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12s-1.536.219-2.121.659c-1.172.879-1.172 2.303 0 3.182l.879.659z"
              />
            </svg>
          </div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
            Ready to get started?
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Let's set up your travel support! We'll help you track expenses and
            handle reimbursements so you can focus on giving an amazing talk.
          </p>
          {createError && (
            <ErrorDisplay
              title="Failed to create travel support"
              message={createError}
              className="mb-6"
            />
          )}
          <button
            onClick={createTravelSupport}
            disabled={isCreating}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isCreating ? 'Setting up...' : 'Start Travel Support Request'}
          </button>
        </div>
      </div>
    )
  }

  const isSubmitted = !canEdit

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Status Banner */}
      {isSubmitted && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
          <div className="flex items-center gap-3">
            <StatusBadge status={travelSupport.status} />
            <div className="text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-200">
                Travel Support Request{' '}
                {TravelSupportService.getStatusDisplayName(
                  travelSupport.status,
                )}
              </p>
              <p className="mt-1 text-blue-700 dark:text-blue-300">
                Your request is being reviewed by the organizers. You will be
                notified of any updates via email.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Travel Support
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-300">
          Submit your travel expenses for reimbursement
        </p>
      </div>

      {/* Banking Details Section */}
      <ErrorBoundary>
        <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                  Banking Details
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Provide your banking information for reimbursement transfers
                </p>
              </div>
            </div>

            <div className="mt-6">
              {bankingError && (
                <ErrorDisplay
                  title="Banking details error"
                  message={bankingError}
                  className="mb-4"
                />
              )}

              {showBankingForm ? (
                <div>
                  <BankingDetailsForm
                    initialData={travelSupport.bankingDetails}
                    onSave={updateBankingDetails}
                    isLoading={isUpdatingBanking}
                  />
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => setShowBankingForm(false)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : isUpdatingBanking ? (
                <BankingDetailsSkeleton />
              ) : (
                <BankingDetailsDisplay
                  bankingDetails={travelSupport.bankingDetails}
                  canEdit={canEdit}
                  onEdit={() => setShowBankingForm(true)}
                />
              )}
            </div>
          </div>
        </div>
      </ErrorBoundary>

      {/* Expenses Section */}
      <ErrorBoundary>
        <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                  Expenses
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Upload your travel-related expenses with receipts
                </p>
              </div>
              {canEdit && !showExpenseForm && (
                <button
                  onClick={() => setShowExpenseForm(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Expense
                </button>
              )}
            </div>

            <div className="mt-6">
              {expenseError && (
                <ErrorDisplay
                  title="Expense error"
                  message={expenseError}
                  className="mb-4"
                />
              )}

              {showExpenseForm && (
                <div className="mb-6">
                  <ExpenseForm
                    initialData={editingExpense || undefined}
                    onSave={handleExpenseSave}
                    onCancel={handleExpenseCancel}
                    isLoading={
                      editingExpense ? isUpdatingExpense : isAddingExpense
                    }
                    mode={editingExpense ? 'edit' : 'add'}
                  />
                </div>
              )}

              <ExpensesList
                expenses={travelSupport.expenses || []}
                canEdit={canEdit}
                onEdit={handleExpenseEdit}
                onDelete={handleExpenseDelete}
                onDeleteReceipt={handleReceiptDelete}
              />
            </div>
          </div>
        </div>
      </ErrorBoundary>

      {/* Expense Summary */}
      {travelSupport.expenses && travelSupport.expenses.length > 0 && (
        <ErrorBoundary>
          <ExpenseSummary
            expenses={travelSupport.expenses}
            preferredCurrency={
              travelSupport.bankingDetails.preferredCurrency || 'NOK'
            }
          />
        </ErrorBoundary>
      )}

      {/* Submit Section */}
      {canEdit && TravelSupportService.canSubmit(travelSupport) && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
          <h3 className="text-lg font-medium text-green-800 dark:text-green-200">
            Ready to submit?
          </h3>
          <p className="mt-2 text-sm text-green-700 dark:text-green-300">
            Once submitted, you won't be able to make changes to your travel
            support request.
          </p>
          {submitError && (
            <ErrorDisplay
              title="Submission failed"
              message={submitError}
              className="mt-4"
            />
          )}
          <div className="mt-4">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-500 dark:hover:bg-green-400"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Travel Support Request'}
            </button>
          </div>
        </div>
      )}

      {/* Exchange Rate Debug Panel */}
      <ExchangeRateDebugPanel />
    </div>
  )
}
