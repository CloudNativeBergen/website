'use client'

import { useState } from 'react'
import { PlusIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { TravelSupportService } from '@/lib/travel-support/service'
import type {
  TravelExpenseInput,
  TravelSupportWithExpenses,
} from '@/lib/travel-support/types'
import { BankingDetailsForm } from './BankingDetailsForm'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseSummary } from './ExpenseSummary'
import { ExchangeRateDebugPanel } from './ExchangeRateDebugPanel'
import { StatusBadge } from './StatusBadge'
import { ExpensesList } from './ExpensesList'
import { BankingDetailsDisplay } from './BankingDetailsDisplay'
import { ApprovalSummary } from './ApprovalSummary'
import { LoadingState, BankingDetailsSkeleton } from './LoadingStates'
import { ErrorDisplay } from './ErrorComponents'
import { ErrorBoundary } from './ErrorBoundary'

interface TravelSupportPageClientProps {
  initialTravelSupport: TravelSupportWithExpenses | null
  speakerId: string
}

export function TravelSupportPageClient({
  initialTravelSupport,
  speakerId,
}: TravelSupportPageClientProps) {
  const [showBankingForm, setShowBankingForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<
    (TravelExpenseInput & { _id?: string }) | null
  >(null)

  const {
    data: travelSupport,
    isLoading,
    error: queryError,
    refetch,
  } = api.travelSupport.getMine.useQuery(undefined, {
    initialData: initialTravelSupport || undefined,
  })

  const canEdit = travelSupport?.status === 'draft'

  const createMutation = api.travelSupport.create.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const updateBankingMutation =
    api.travelSupport.updateBankingDetails.useMutation({
      onSuccess: () => {
        refetch()
        setShowBankingForm(false)
      },
    })

  const addExpenseMutation = api.travelSupport.addExpense.useMutation({
    onSuccess: () => {
      refetch()
      setShowExpenseForm(false)
    },
  })

  const updateExpenseMutation = api.travelSupport.updateExpense.useMutation({
    onSuccess: () => {
      refetch()
      setEditingExpense(null)
      setShowExpenseForm(false)
    },
  })

  const deleteExpenseMutation = api.travelSupport.deleteExpense.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const deleteReceiptMutation = api.travelSupport.deleteReceipt.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const submitMutation = api.travelSupport.submit.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const createTravelSupport = async (): Promise<void> => {
    await createMutation.mutateAsync({
      speaker: { _ref: speakerId, _type: 'reference' },
      bankingDetails: {
        beneficiaryName: '',
        bankName: '',
        swiftCode: '',
        country: '',
        preferredCurrency: 'NOK',
      },
    })
  }

  const updateBankingDetails = async (bankingDetails: {
    beneficiaryName: string
    bankName: string
    swiftCode: string
    country: string
    preferredCurrency: 'NOK' | 'USD' | 'EUR' | 'GBP' | 'SEK' | 'DKK' | 'OTHER'
    iban?: string
    accountNumber?: string
  }): Promise<void> => {
    if (!travelSupport?._id) {
      throw new Error('No travel support found')
    }

    await updateBankingMutation.mutateAsync({
      travelSupportId: travelSupport._id,
      bankingDetails,
    })
  }

  const addExpense = async (expense: TravelExpenseInput): Promise<void> => {
    if (!travelSupport?._id) {
      throw new Error('No travel support found')
    }

    await addExpenseMutation.mutateAsync({
      travelSupportId: travelSupport._id,
      expense,
    })
  }

  const updateExpense = async (
    expenseId: string,
    expense: TravelExpenseInput,
  ): Promise<void> => {
    await updateExpenseMutation.mutateAsync({
      expenseId,
      expense,
    })
  }

  const deleteExpense = async (expenseId: string): Promise<void> => {
    await deleteExpenseMutation.mutateAsync({ expenseId })
  }

  const deleteReceipt = async (
    expenseId: string,
    receiptIndex: number,
  ): Promise<void> => {
    await deleteReceiptMutation.mutateAsync({ expenseId, receiptIndex })
  }

  const submitTravelSupport = async (): Promise<void> => {
    if (!travelSupport?._id) {
      throw new Error('No travel support found')
    }

    if (!travelSupport.bankingDetails.beneficiaryName) {
      throw new Error('Banking details are required before submission')
    }

    if (!travelSupport.expenses || travelSupport.expenses.length === 0) {
      throw new Error('At least one expense is required before submission')
    }

    await submitMutation.mutateAsync({
      travelSupportId: travelSupport._id,
    })
  }

  const handleInlineExpenseEdit = async (
    expenseId: string,
    expenseData: TravelExpenseInput,
  ) => {
    return await updateExpense(expenseId, expenseData)
  }

  const handleExpenseCancel = () => {
    setEditingExpense(null)
    setShowExpenseForm(false)
  }

  const handleExpenseSave = async (expenseData: TravelExpenseInput) => {
    if (editingExpense) {
      await updateExpense(editingExpense._id!, expenseData)
    } else {
      await addExpense(expenseData)
    }
  }

  const handleExpenseDelete = async (expenseId: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      await deleteExpense(expenseId)
    }
  }

  const handleReceiptDelete = async (
    expenseId: string,
    receiptIndex: number,
  ) => {
    if (confirm('Are you sure you want to delete this receipt?')) {
      await deleteReceipt(expenseId, receiptIndex)
    }
  }

  const handleSubmit = async () => {
    if (
      confirm(
        'Are you sure you want to submit? You will not be able to make changes after submission.',
      )
    ) {
      await submitTravelSupport()
    }
  }

  if (isLoading) {
    return <LoadingState />
  }

  if (queryError) {
    return (
      <ErrorDisplay
        title="Failed to load travel support"
        message={queryError.message}
      />
    )
  }

  if (!travelSupport) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
            <CurrencyDollarIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
            Ready to get started?
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Let&apos;s set up your travel support! We&apos;ll help you track
            expenses and handle reimbursements so you can focus on giving an
            amazing talk.
          </p>
          {createMutation.error && (
            <ErrorDisplay
              title="Failed to create travel support request"
              message={createMutation.error.message}
              className="mb-6"
            />
          )}
          <button
            onClick={createTravelSupport}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {createMutation.isPending
              ? 'Setting up...'
              : 'Start Travel Support Request'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Travel Support
          </h1>
          <StatusBadge status={travelSupport.status} />
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {travelSupport.status === 'submitted'
            ? 'Your request has been submitted. Organizers will review each expense individually.'
            : 'Submit and manage your travel expense reimbursements'}
        </p>
      </div>

      {/* Show approval details when request is approved/paid */}
      {(travelSupport.status === 'approved' ||
        travelSupport.status === 'paid') && (
        <div className="mb-6">
          <ErrorBoundary>
            <ApprovalSummary travelSupport={travelSupport} />
          </ErrorBoundary>
        </div>
      )}

      <div className="flex gap-6">
        {/* Main Content */}
        <div className="flex-1 space-y-6">
          <ErrorBoundary>
            <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                      Banking Details
                    </h2>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Provide your banking information for reimbursement
                      transfers
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  {updateBankingMutation.error && (
                    <ErrorDisplay
                      title="Banking details error"
                      message={updateBankingMutation.error.message}
                      className="mb-4"
                    />
                  )}

                  {showBankingForm ? (
                    <div>
                      <BankingDetailsForm
                        initialData={travelSupport.bankingDetails}
                        onSave={updateBankingDetails}
                        isLoading={updateBankingMutation.isPending}
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
                  ) : updateBankingMutation.isPending ? (
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
                  {(addExpenseMutation.error ||
                    updateExpenseMutation.error) && (
                    <ErrorDisplay
                      title="Expense error"
                      message={
                        addExpenseMutation.error?.message ||
                        updateExpenseMutation.error?.message ||
                        ''
                      }
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
                          editingExpense
                            ? updateExpenseMutation.isPending
                            : addExpenseMutation.isPending
                        }
                        mode={editingExpense ? 'edit' : 'add'}
                      />
                    </div>
                  )}

                  <ExpensesList
                    expenses={travelSupport.expenses || []}
                    canEdit={canEdit}
                    onEdit={handleInlineExpenseEdit}
                    onDelete={handleExpenseDelete}
                    onDeleteReceipt={handleReceiptDelete}
                    isUpdatingExpense={updateExpenseMutation.isPending}
                    expenseError={updateExpenseMutation.error?.message || null}
                  />
                </div>
              </div>
            </div>
          </ErrorBoundary>

          {canEdit && TravelSupportService.canSubmit(travelSupport) && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
              <h3 className="text-lg font-medium text-green-800 dark:text-green-200">
                Ready to submit?
              </h3>
              <p className="mt-2 text-sm text-green-700 dark:text-green-300">
                Once submitted, you won&apos;t be able to make changes to your
                travel support request.
              </p>
              {submitMutation.error && (
                <ErrorDisplay
                  title="Submission failed"
                  message={submitMutation.error.message}
                  className="mt-4"
                />
              )}
              <div className="mt-4">
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-500 dark:hover:bg-green-400"
                >
                  {submitMutation.isPending
                    ? 'Submitting...'
                    : 'Submit Travel Support Request'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {travelSupport.expenses && travelSupport.expenses.length > 0 && (
          <div className="hidden w-80 shrink-0 lg:block">
            <ErrorBoundary>
              <ExpenseSummary
                expenses={travelSupport.expenses}
                preferredCurrency={
                  travelSupport.bankingDetails.preferredCurrency || 'NOK'
                }
              />
            </ErrorBoundary>
          </div>
        )}
      </div>

      {/* Exchange Rate Debug Panel */}
      <ExchangeRateDebugPanel />
    </div>
  )
}
