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

export function TravelSupportAdminPage() {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)
  const { data: session } = useSession()

  // Get all travel support requests
  const {
    data: requests,
    isLoading,
    error,
    refetch,
  } = api.travelSupport.list.useQuery({})

  // Get detailed view of selected request
  const { data: selectedRequestDetails, isLoading: isLoadingDetails } =
    api.travelSupport.getById.useQuery(
      { id: selectedRequest! },
      { enabled: !!selectedRequest },
    )

  // Mutations
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
          // Refetch details
        }
      },
    })

  const handleUpdateStatus = async (
    requestId: string,
    status: TravelSupportStatus,
    approvedAmount?: number,
    reviewNotes?: string,
  ) => {
    try {
      await updateStatusMutation.mutateAsync({
        travelSupportId: requestId,
        status,
        approvedAmount,
        reviewNotes,
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
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">
            Loading travel support requests...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="text-sm text-red-800">
          Failed to load travel support requests: {error.message}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Travel Support Administration
        </h1>
        <p className="mt-2 text-gray-600">
          Review and approve travel support requests from speakers
        </p>
      </div>

      {/* Summary Stats */}
      {requests && <SummaryStats requests={requests} />}

      {/* Requests List */}
      <ErrorBoundary>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left Column - Requests List */}
          <div className="rounded-lg bg-white shadow">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Requests ({requests?.length || 0})
              </h2>
            </div>
            <div className="divide-y divide-gray-200">
              {requests?.map((request) => (
                <RequestCard
                  key={request._id}
                  request={request}
                  isSelected={selectedRequest === request._id}
                  onSelect={() => setSelectedRequest(request._id)}
                />
              ))}
              {requests?.length === 0 && (
                <div className="p-6 text-center text-gray-500">
                  No travel support requests yet
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="rounded-lg bg-white shadow">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Request Details
              </h2>
            </div>
            <div className="p-6">
              {selectedRequest ? (
                isLoadingDetails ? (
                  <div className="py-8 text-center">
                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-t-2 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-sm text-gray-600">
                      Loading details...
                    </p>
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
                  <p className="text-gray-500">
                    Failed to load request details
                  </p>
                )
              ) : (
                <p className="text-gray-500">
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

// Helper components
function SummaryStats({ requests }: { requests: TravelSupportWithSpeaker[] }) {
  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === TravelSupportStatus.SUBMITTED)
      .length,
    approved: requests.filter((r) => r.status === TravelSupportStatus.APPROVED)
      .length,
    paid: requests.filter((r) => r.status === TravelSupportStatus.PAID).length,
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <StatCard label="Total Requests" value={stats.total} />
      <StatCard label="Pending Review" value={stats.pending} color="yellow" />
      <StatCard label="Approved" value={stats.approved} color="green" />
      <StatCard label="Paid" value={stats.paid} color="purple" />
    </div>
  )
}

function StatCard({
  label,
  value,
  color = 'gray',
}: {
  label: string
  value: number
  color?: 'gray' | 'yellow' | 'green' | 'purple'
}) {
  const colors = {
    gray: 'bg-gray-50 text-gray-900',
    yellow: 'bg-yellow-50 text-yellow-900',
    green: 'bg-green-50 text-green-900',
    purple: 'bg-purple-50 text-purple-900',
  }

  return (
    <div className={`rounded-lg p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm">{label}</div>
    </div>
  )
}

function RequestCard({
  request,
  isSelected,
  onSelect,
}: {
  request: TravelSupportWithSpeaker
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={`cursor-pointer p-4 transition-colors ${
        isSelected
          ? 'border-l-4 border-blue-500 bg-blue-50'
          : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{request.speaker.name}</h3>
          <p className="text-sm text-gray-600">{request.speaker.email}</p>
          <p className="mt-1 text-sm text-gray-500">
            {request.conference.name}
          </p>
        </div>
        <div className="text-right">
          <StatusBadge status={request.status} />
          {request.totalAmount !== undefined && request.totalAmount > 0 && (
            <p className="mt-1 text-sm font-semibold text-gray-900">
              ${request.totalAmount}
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

  // Check if current user can approve this request
  const canApprove =
    request.status === TravelSupportStatus.SUBMITTED &&
    currentUserId &&
    TravelSupportService.canUserApprove(
      true, // We know they're admin since they can access this page
      request.speaker._id,
      currentUserId,
    )

  return (
    <div className="space-y-6">
      {/* Speaker Info */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          {request.speaker.name}
        </h3>
        <p className="text-gray-600">{request.speaker.email}</p>
        <StatusBadge status={request.status} />
      </div>

      {/* Banking Details */}
      <div>
        <h4 className="mb-2 font-medium text-gray-900">Banking Details</h4>
        <div className="space-y-1 rounded bg-gray-50 p-3 text-sm">
          <div>
            <strong>Name:</strong> {request.bankingDetails.beneficiaryName}
          </div>
          <div>
            <strong>Bank:</strong> {request.bankingDetails.bankName}
          </div>
          {request.bankingDetails.iban && (
            <div>
              <strong>IBAN:</strong> {request.bankingDetails.iban}
            </div>
          )}
          {request.bankingDetails.accountNumber && (
            <div>
              <strong>Account:</strong> {request.bankingDetails.accountNumber}
            </div>
          )}
          <div>
            <strong>SWIFT:</strong> {request.bankingDetails.swiftCode}
          </div>
          <div>
            <strong>Country:</strong> {request.bankingDetails.country}
          </div>
        </div>
      </div>

      {/* Expenses */}
      <div>
        <h4 className="mb-2 font-medium text-gray-900">Expenses</h4>
        {request.expenses && request.expenses.length > 0 ? (
          <div className="space-y-3">
            {request.expenses.map((expense: TravelExpense) => (
              <div key={expense._id} className="rounded border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{expense.description}</div>
                    <div className="text-sm text-gray-600">
                      {expense.category} • {expense.location} •{' '}
                      {expense.expenseDate}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {expense.description}
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <div className="font-semibold">
                      {expense.amount}{' '}
                      {expense.currency === 'OTHER'
                        ? expense.customCurrency
                        : expense.currency}
                    </div>
                    <StatusBadge status={expense.status} />
                  </div>
                </div>

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
                      className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
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
                      className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No expenses submitted</p>
        )}
      </div>

      {/* Expense Summary */}
      {request.expenses && request.expenses.length > 0 && (
        <ExpenseSummary
          expenses={request.expenses}
          preferredCurrency={request.bankingDetails.preferredCurrency || 'NOK'}
        />
      )}

      {/* Review Actions */}
      {canApprove && (
        <div className="border-t pt-6">
          <h4 className="mb-3 font-medium text-gray-900">Review Actions</h4>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Approved Amount ($)
              </label>
              <input
                type="number"
                value={approvedAmount}
                onChange={(e) =>
                  setApprovedAmount(parseFloat(e.target.value) || 0)
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Review Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Optional notes for the speaker..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() =>
                  onUpdateStatus(
                    request._id,
                    TravelSupportStatus.APPROVED,
                    approvedAmount,
                    reviewNotes,
                  )
                }
                disabled={isUpdating}
                className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
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
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isUpdating ? 'Updating...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Self-approval restriction notice */}
      {request.status === TravelSupportStatus.SUBMITTED &&
        currentUserId === request.speaker._id && (
          <div className="border-t pt-6">
            <div className="rounded border border-amber-200 bg-amber-50 p-4">
              <h5 className="font-medium text-amber-800">
                Cannot Approve Own Request
              </h5>
              <p className="mt-1 text-sm text-amber-700">
                You cannot approve your own travel support request. Another
                admin must review and approve this request.
              </p>
            </div>
          </div>
        )}

      {/* Existing Review Notes */}
      {request.reviewNotes && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
          <h5 className="font-medium text-yellow-800">Review Notes</h5>
          <p className="mt-1 text-sm text-yellow-700">{request.reviewNotes}</p>
        </div>
      )}
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: TravelSupportStatus | ExpenseStatus
}) {
  const colors = {
    draft: 'bg-gray-100 text-gray-800',
    submitted: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    paid: 'bg-purple-100 text-purple-800',
    rejected: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${colors[status as keyof typeof colors]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
