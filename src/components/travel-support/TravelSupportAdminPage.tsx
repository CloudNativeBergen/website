'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'
import {
  TravelSupportStatus,
  ExpenseStatus,
  TravelSupportWithSpeaker,
  TravelExpense,
} from '@/lib/travel-support/types'
import { TravelSupportService } from '@/lib/travel-support/service'
import { ExpenseSummary } from './ExpenseSummary'
import { ErrorBoundary } from './ErrorBoundary'
import { CurrencyDollarIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { SkeletonCard } from '@/components/admin/LoadingSkeleton'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { ReceiptViewer } from './ReceiptViewer'

export function TravelSupportAdminPage() {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)
  const { data: session } = useSession()

  const {
    data: allRequests,
    isLoading,
    error,
    refetch,
  } = api.travelSupport.list.useQuery({})

  // Filter out draft requests - only show submitted, approved, rejected, or paid
  const requests = allRequests?.filter(
    (r) => r.status !== TravelSupportStatus.DRAFT,
  )

  const { data: selectedRequestDetails, isLoading: isLoadingDetails } =
    api.travelSupport.getById.useQuery(
      { id: selectedRequest! },
      { enabled: !!selectedRequest },
    )

  const updateStatusMutation = api.travelSupport.updateStatus.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const updateExpenseStatusMutation =
    api.travelSupport.updateExpenseStatus.useMutation({
      onSuccess: () => {
        refetch()
        if (selectedRequest) {
        }
      },
    })

  const handleUpdateStatus = async (
    requestId: string,
    status: TravelSupportStatus,
    approvedAmount?: number,
    reviewNotes?: string,
    expectedPaymentDate?: string,
  ) => {
    try {
      await updateStatusMutation.mutateAsync({
        travelSupportId: requestId,
        status,
        approvedAmount,
        reviewNotes,
        expectedPaymentDate,
      })
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const handleUpdateExpenseStatus = async (
    expenseId: string,
    status: ExpenseStatus,
    reviewNotes?: string,
  ) => {
    try {
      await updateExpenseStatusMutation.mutateAsync({
        expenseId,
        status,
        reviewNotes,
      })
    } catch (error) {
      console.error('Failed to update expense status:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="pb-6">
          <div className="animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700" />
              <div>
                <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-2 h-4 w-96 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard rows={8} />
          <SkeletonCard rows={8} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
        <div className="text-sm text-red-800 dark:text-red-200">
          Failed to load travel support requests: {error.message}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="pb-6">
        <div className="flex items-center gap-3">
          <CurrencyDollarIcon className="h-8 w-8 text-brand-cloud-blue" />
          <div>
            <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight dark:text-white">
              Travel Support Administration
            </h1>
            <p className="font-inter mt-2 text-sm text-brand-slate-gray/70 dark:text-gray-400">
              Review and approve travel support requests from speakers
            </p>
          </div>
        </div>

        {requests && (
          <div className="font-inter mt-4">
            <SummaryStats requests={requests} />
          </div>
        )}
      </div>

      <SpeakersRequiringSupport />

      <ErrorBoundary>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg bg-white shadow ring-1 ring-brand-frosted-steel/20 dark:bg-gray-800 dark:ring-gray-700">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Requests ({requests?.length || 0})
              </h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {requests?.map((request) => (
                <RequestCard
                  key={request._id}
                  request={request}
                  isSelected={selectedRequest === request._id}
                  onSelect={() => setSelectedRequest(request._id)}
                />
              ))}
              {requests?.length === 0 && (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  No travel support requests yet
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-white shadow ring-1 ring-brand-frosted-steel/20 dark:bg-gray-800 dark:ring-gray-700">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Request Details
              </h2>
            </div>
            <div className="p-6">
              {selectedRequest ? (
                isLoadingDetails ? (
                  <div className="py-4">
                    <div className="animate-pulse space-y-3">
                      <div className="h-6 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-16 rounded bg-gray-200 dark:bg-gray-700" />
                    </div>
                  </div>
                ) : selectedRequestDetails ? (
                  <RequestDetails
                    request={selectedRequestDetails}
                    currentUserId={session?.speaker?._id}
                    onUpdateStatus={handleUpdateStatus}
                    onUpdateExpenseStatus={handleUpdateExpenseStatus}
                    isUpdating={
                      updateStatusMutation.isPending ||
                      updateExpenseStatusMutation.isPending
                    }
                  />
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">
                    Failed to load request details
                  </p>
                )
              ) : (
                <p className="text-gray-500 dark:text-gray-400">
                  Select a request to view details
                </p>
              )}
            </div>
          </div>
        </div>
      </ErrorBoundary>
    </div>
  )
}

function SummaryStats({
  requests,
}: {
  requests: (TravelSupportWithSpeaker & { expenses?: TravelExpense[] })[]
}) {
  const { convertCurrency, isLoading } = useExchangeRates()

  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === TravelSupportStatus.SUBMITTED)
      .length,
    approved: requests.filter((r) => r.status === TravelSupportStatus.APPROVED)
      .length,
    paid: requests.filter((r) => r.status === TravelSupportStatus.PAID).length,
  }

  // Calculate total requested by summing all expenses and converting to NOK
  const totalRequested = requests.reduce((sum, r) => {
    if (!r.expenses || r.expenses.length === 0) return sum
    // Sum all expenses (pending and approved) in their original currencies, then convert to NOK
    const requestTotal = r.expenses.reduce((expenseSum, expense) => {
      const amountInNOK = convertCurrency(
        expense.amount,
        expense.currency,
        'NOK',
      )
      return expenseSum + amountInNOK
    }, 0)
    return sum + requestTotal
  }, 0)

  // Calculate total approved by summing only approved expenses and converting to NOK
  const totalApproved = requests
    .filter(
      (r) =>
        r.status === TravelSupportStatus.APPROVED ||
        r.status === TravelSupportStatus.PAID,
    )
    .reduce((sum, r) => {
      if (r.approvedAmount) {
        // If there's an explicitly approved amount, use that
        const amountInNOK = r.bankingDetails?.preferredCurrency
          ? convertCurrency(
              r.approvedAmount,
              r.bankingDetails.preferredCurrency,
              'NOK',
            )
          : r.approvedAmount
        return sum + amountInNOK
      } else if (r.expenses && r.expenses.length > 0) {
        // Otherwise sum approved expenses
        const approvedExpensesTotal = r.expenses
          .filter((e) => e.status === ExpenseStatus.APPROVED)
          .reduce((expenseSum, expense) => {
            const amountInNOK = convertCurrency(
              expense.amount,
              expense.currency,
              'NOK',
            )
            return expenseSum + amountInNOK
          }, 0)
        return sum + approvedExpensesTotal
      }
      return sum
    }, 0)

  const formatNOK = (amount: number) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <StatCard label="Total Requests" value={stats.total} />
        <StatCard label="Pending Review" value={stats.pending} color="yellow" />
        <StatCard label="Approved" value={stats.approved} color="green" />
        <StatCard label="Paid" value={stats.paid} color="purple" />
        <div className="rounded-lg p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:ring-gray-700">
          <div className="h-6 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="rounded-lg p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:ring-gray-700">
          <div className="h-6 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <StatCard label="Total Requests" value={stats.total} />
      <StatCard label="Pending Review" value={stats.pending} color="yellow" />
      <StatCard label="Approved" value={stats.approved} color="green" />
      <StatCard label="Paid" value={stats.paid} color="purple" />
      <StatCard
        label="Total Requested"
        value={formatNOK(totalRequested)}
        color="blue"
        isAmount={true}
      />
      <StatCard
        label="Total Approved"
        value={formatNOK(totalApproved)}
        color="green"
        isAmount={true}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  color = 'gray',
  isAmount = false,
}: {
  label: string
  value: number | string
  color?: 'gray' | 'yellow' | 'green' | 'purple' | 'blue'
  isAmount?: boolean
}) {
  const colors = {
    gray: 'bg-white dark:bg-gray-800 text-brand-slate-gray dark:text-white',
    yellow: 'bg-white dark:bg-gray-800 text-yellow-600 dark:text-yellow-400',
    green:
      'bg-white dark:bg-gray-800 text-brand-fresh-green dark:text-green-400',
    purple: 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400',
    blue: 'bg-white dark:bg-gray-800 text-brand-cloud-blue dark:text-blue-400',
  }

  return (
    <div
      className={`rounded-lg p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:ring-gray-700 ${colors[color]}`}
    >
      <div className={`${isAmount ? 'text-lg' : 'text-xl'} font-bold`}>
        {value}
        {typeof value === 'number' && !isAmount && value > 0 && (
          <span className="text-sm font-normal text-brand-slate-gray/60 dark:text-gray-400"></span>
        )}
      </div>
      <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
        {label}
      </div>
    </div>
  )
}

function RequestCard({
  request,
  isSelected,
  onSelect,
}: {
  request: TravelSupportWithSpeaker & { expenses?: TravelExpense[] }
  isSelected: boolean
  onSelect: () => void
}) {
  const { convertCurrency } = useExchangeRates()

  // Calculate total from expenses if available
  const totalInNOK =
    request.expenses && request.expenses.length > 0
      ? request.expenses.reduce((sum, expense) => {
          return sum + convertCurrency(expense.amount, expense.currency, 'NOK')
        }, 0)
      : request.totalAmount || 0

  return (
    <div
      className={`cursor-pointer p-4 transition-colors ${
        isSelected
          ? 'border-l-4 border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white">
            {request.speaker.name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {request.speaker.email}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            {request.conference.name}
          </p>
        </div>
        <div className="text-right">
          <StatusBadge status={request.status} />
          {totalInNOK > 0 && (
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {new Intl.NumberFormat('nb-NO', {
                style: 'currency',
                currency: 'NOK',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(totalInNOK)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function RequestDetails({
  request,
  currentUserId,
  onUpdateStatus,
  onUpdateExpenseStatus,
  isUpdating,
}: {
  request: TravelSupportWithSpeaker & { expenses: TravelExpense[] }
  currentUserId?: string
  onUpdateStatus: (
    id: string,
    status: TravelSupportStatus,
    amount?: number,
    notes?: string,
    expectedPaymentDate?: string,
  ) => void
  onUpdateExpenseStatus: (
    id: string,
    status: ExpenseStatus,
    notes?: string,
  ) => void
  isUpdating: boolean
}) {
  const [reviewNotes, setReviewNotes] = useState('')
  const [approvedAmount, setApprovedAmount] = useState<number>(
    request.totalAmount || 0,
  )
  const [expectedPaymentDate, setExpectedPaymentDate] = useState<string>('')
  const [viewingReceipt, setViewingReceipt] = useState<{
    expense: TravelExpense
    index: number
  } | null>(null)
  const { convertCurrency } = useExchangeRates()

  // Calculate total reimbursable (approved + pending expenses) in NOK
  const totalReimbursableNOK =
    request.expenses && request.expenses.length > 0
      ? request.expenses
          .filter(
            (e) =>
              e.status === ExpenseStatus.APPROVED ||
              e.status === ExpenseStatus.PENDING,
          )
          .reduce((sum, expense) => {
            const amountInNOK = convertCurrency(
              expense.amount,
              expense.currency,
              'NOK',
            )
            return sum + amountInNOK
          }, 0)
      : 0

  const canApprove =
    request.status === TravelSupportStatus.SUBMITTED &&
    currentUserId &&
    TravelSupportService.canUserApprove(
      true,
      request.speaker._id,
      currentUserId,
    )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {request.speaker.name}
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          {request.speaker.email}
        </p>
        <StatusBadge status={request.status} />
      </div>

      <div>
        <h4 className="mb-2 font-medium text-gray-900 dark:text-white">
          Banking Details
        </h4>
        <div className="space-y-1 rounded bg-gray-50 p-3 text-sm dark:bg-gray-700">
          <div className="text-gray-900 dark:text-gray-100">
            <strong>Name:</strong> {request.bankingDetails.beneficiaryName}
          </div>
          <div className="text-gray-900 dark:text-gray-100">
            <strong>Bank:</strong> {request.bankingDetails.bankName}
          </div>
          {request.bankingDetails.iban && (
            <div className="text-gray-900 dark:text-gray-100">
              <strong>IBAN:</strong> {request.bankingDetails.iban}
            </div>
          )}
          {request.bankingDetails.accountNumber && (
            <div className="text-gray-900 dark:text-gray-100">
              <strong>Account:</strong> {request.bankingDetails.accountNumber}
            </div>
          )}
          <div className="text-gray-900 dark:text-gray-100">
            <strong>SWIFT:</strong> {request.bankingDetails.swiftCode}
          </div>
          <div className="text-gray-900 dark:text-gray-100">
            <strong>Country:</strong> {request.bankingDetails.country}
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 font-medium text-gray-900 dark:text-white">
          Expenses
        </h4>
        {request.expenses && request.expenses.length > 0 ? (
          <div className="space-y-3">
            {request.expenses.map((expense: TravelExpense) => (
              <div
                key={expense._id}
                className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {expense.description}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {expense.category} • {expense.location} •{' '}
                      {expense.expenseDate}
                    </div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                      {expense.description}
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {expense.amount}{' '}
                      {expense.currency === 'OTHER'
                        ? expense.customCurrency
                        : expense.currency}
                    </div>
                    <StatusBadge status={expense.status} />
                  </div>
                </div>

                {expense.receipts && expense.receipts.length > 0 && (
                  <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-600">
                    <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                      Receipts:
                    </p>
                    <div className="space-y-1">
                      {expense.receipts.map((receipt, receiptIndex) => (
                        <button
                          key={receiptIndex}
                          onClick={() =>
                            setViewingReceipt({ expense, index: receiptIndex })
                          }
                          className="flex w-full cursor-pointer items-center gap-2 rounded bg-white px-2 py-1.5 text-left text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:bg-gray-800 dark:hover:bg-gray-600 dark:hover:text-indigo-300"
                        >
                          <PaperClipIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                          <span className="flex-1 text-gray-700 dark:text-gray-300">
                            {receipt.filename || `Receipt ${receiptIndex + 1}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {canApprove && expense.status === ExpenseStatus.PENDING && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        onUpdateExpenseStatus(
                          expense._id,
                          ExpenseStatus.APPROVED,
                        )
                      }
                      disabled={isUpdating}
                      className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50 dark:bg-green-800 dark:hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        onUpdateExpenseStatus(
                          expense._id,
                          ExpenseStatus.REJECTED,
                        )
                      }
                      disabled={isUpdating}
                      className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-800 dark:hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic dark:text-gray-400">
            No expenses submitted
          </p>
        )}
      </div>

      {request.expenses && request.expenses.length > 0 && (
        <ExpenseSummary
          expenses={request.expenses}
          preferredCurrency={request.bankingDetails.preferredCurrency || 'NOK'}
        />
      )}

      {canApprove && (
        <div className="border-t border-gray-200 pt-6 dark:border-gray-600">
          <h4 className="mb-3 font-medium text-gray-900 dark:text-white">
            Review Actions
          </h4>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Approved Amount (NOK)
                </label>
                {totalReimbursableNOK > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setApprovedAmount(Math.round(totalReimbursableNOK))
                    }
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Use Total Reimbursable (
                    {new Intl.NumberFormat('nb-NO', {
                      style: 'currency',
                      currency: 'NOK',
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(totalReimbursableNOK)}
                    )
                  </button>
                )}
              </div>
              <input
                type="number"
                value={approvedAmount}
                onChange={(e) =>
                  setApprovedAmount(parseFloat(e.target.value) || 0)
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Expected Payment Date
              </label>
              <input
                type="date"
                value={expectedPaymentDate}
                onChange={(e) => setExpectedPaymentDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                When the payment will be made to the speaker&apos;s account
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Review Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                placeholder="Optional notes for the speaker..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                These notes will be visible to the speaker
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() =>
                  onUpdateStatus(
                    request._id,
                    TravelSupportStatus.APPROVED,
                    approvedAmount,
                    reviewNotes,
                    expectedPaymentDate || undefined,
                  )
                }
                disabled={isUpdating}
                className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50 dark:bg-green-800 dark:hover:bg-green-700"
              >
                {isUpdating ? 'Updating...' : 'Approve'}
              </button>
              <button
                onClick={() =>
                  onUpdateStatus(
                    request._id,
                    TravelSupportStatus.REJECTED,
                    undefined,
                    reviewNotes,
                  )
                }
                disabled={isUpdating}
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-800 dark:hover:bg-red-700"
              >
                {isUpdating ? 'Updating...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {request.status === TravelSupportStatus.SUBMITTED &&
        currentUserId === request.speaker._id && (
          <div className="border-t border-gray-200 pt-6 dark:border-gray-600">
            <div className="rounded border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
              <h5 className="font-medium text-amber-800 dark:text-amber-200">
                Cannot Approve Own Request
              </h5>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                You cannot approve your own travel support request. Another
                admin must review and approve this request.
              </p>
            </div>
          </div>
        )}

      {/* Existing Review Notes */}
      {request.reviewNotes && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/20">
          <h5 className="font-medium text-yellow-800 dark:text-yellow-200">
            Review Notes
          </h5>
          <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
            {request.reviewNotes}
          </p>
        </div>
      )}

      {viewingReceipt && (
        <ReceiptViewer
          receipt={viewingReceipt.expense.receipts[viewingReceipt.index]}
          receiptIndex={viewingReceipt.index}
          onClose={() => setViewingReceipt(null)}
        />
      )}
    </div>
  )
}

function SpeakersRequiringSupport() {
  const {
    data: speakers,
    isLoading,
    error,
  } = api.travelSupport.getSpeakersRequiringSupport.useQuery()

  if (isLoading) {
    return (
      <div className="mb-6 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
        <div className="text-sm text-blue-800 dark:text-blue-200">
          Loading speakers requiring travel support...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-6 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
        <div className="text-sm text-red-800 dark:text-red-200">
          Failed to load speakers requiring travel support: {error.message}
        </div>
      </div>
    )
  }

  if (!speakers || speakers.length === 0) {
    return (
      <div className="mb-6 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
        <div className="text-sm text-green-800 dark:text-green-200">
          No speakers with confirmed talks require travel funding, or all have
          submitted their requests.
        </div>
      </div>
    )
  }

  const pendingSpeakers = speakers.filter((s) => !s.hasSubmitted)
  const submittedCount = speakers.filter((s) => s.hasSubmitted).length

  if (pendingSpeakers.length === 0) {
    return (
      <div className="mb-6 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
        <div className="text-sm text-green-800 dark:text-green-200">
          ✓ All {speakers.length} speaker{speakers.length !== 1 ? 's' : ''} with
          confirmed talks requiring travel funding have submitted their requests
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-lg border-2 border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-800 dark:bg-yellow-900/20">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-yellow-900 dark:text-yellow-200">
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        Speakers Awaiting Travel Support Submission ({submittedCount}/
        {speakers.length} submitted)
      </h3>
      <p className="mb-4 text-sm text-yellow-800 dark:text-yellow-300">
        The following speakers have confirmed talks and require travel funding,
        but have not yet submitted their travel support request:
      </p>
      <div className="space-y-2">
        {pendingSpeakers.map((speaker) => (
          <div
            key={speaker._id}
            className="rounded-lg border border-yellow-300 bg-white p-3 dark:border-yellow-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  {speaker.name}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {speaker.email}
                </p>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                  {speaker.confirmedTalks.length} confirmed talk
                  {speaker.confirmedTalks.length !== 1 ? 's' : ''}
                  {speaker.confirmedTalks.length > 0 && (
                    <>
                      :{' '}
                      {speaker.confirmedTalks
                        .map((talk) => talk.title)
                        .join(', ')}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: TravelSupportStatus | ExpenseStatus
}) {
  const colors = {
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    submitted:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    approved:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    pending:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${colors[status as keyof typeof colors]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
