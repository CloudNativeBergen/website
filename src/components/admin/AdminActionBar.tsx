'use client'

import { CheckIcon, XMarkIcon, BellIcon } from '@heroicons/react/20/solid'
import { ProposalExisting, Action } from '@/lib/proposal/types'

interface AdminActionBarProps {
  proposal: ProposalExisting
}

export function AdminActionBar({ proposal }: AdminActionBarProps) {
  const handleAction = (action: Action) => {
    const event = new CustomEvent('proposalAction', {
      detail: { action, proposal },
    })
    window.dispatchEvent(event)
  }

  const canApprove = proposal.status === 'submitted'
  const canRemind = proposal.status === 'accepted'
  const canReject =
    proposal.status === 'submitted' || proposal.status === 'accepted'

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left side - Status and Info */}
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {/* Status */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-gray-600">Status:</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                proposal.status === 'accepted'
                  ? 'bg-green-100 text-green-800'
                  : proposal.status === 'rejected'
                    ? 'bg-red-100 text-red-800'
                    : proposal.status === 'submitted'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
              }`}
            >
              {proposal.status.charAt(0).toUpperCase() +
                proposal.status.slice(1)}
            </span>
          </div>

          {/* Reviews Summary */}
          {proposal.reviews && proposal.reviews.length > 0 && (
            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-gray-600">
                Reviews:
              </span>
              <span className="text-sm whitespace-nowrap text-gray-900">
                {proposal.reviews.length} review
                {proposal.reviews.length !== 1 ? 's' : ''}
                {(() => {
                  const totalScore = proposal.reviews.reduce((sum, review) => {
                    const reviewScore =
                      (review.score.content +
                        review.score.relevance +
                        review.score.speaker) /
                      3
                    return sum + reviewScore
                  }, 0)
                  const averageScore = totalScore / proposal.reviews.length
                  return ` (${averageScore.toFixed(1)}/5)`
                })()}
              </span>
            </div>
          )}
        </div>

        {/* Right side - Compact Action Buttons */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {canApprove && (
            <button
              onClick={() => handleAction(Action.accept)}
              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
            >
              <CheckIcon className="h-3 w-3" />
              Approve
            </button>
          )}
          {canRemind && (
            <button
              onClick={() => handleAction(Action.remind)}
              className="inline-flex items-center gap-1 rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-yellow-700"
            >
              <BellIcon className="h-3 w-3" />
              Remind
            </button>
          )}
          {canReject && (
            <button
              onClick={() => handleAction(Action.reject)}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              <XMarkIcon className="h-3 w-3" />
              Reject
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
