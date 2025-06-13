'use client'

import { useState, useEffect } from 'react'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Action, Status } from '@/lib/proposal/types'
import { ProposalReviewSummary } from './ProposalReviewSummary'
import { ProposalReviewForm } from './ProposalReviewForm'
import { ProposalReviewList } from './ProposalReviewList'
import { ProposalActionModal } from './ProposalActionModal'
import {
  CheckIcon,
  XMarkIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'

interface ProposalActionPanelProps {
  proposal: ProposalExisting
  initialReviews: Review[]
  currentUser?: Speaker
}

export function ProposalActionPanel({
  proposal,
  initialReviews,
  currentUser,
}: ProposalActionPanelProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews || [])
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [selectedAction, setSelectedAction] = useState<Action>(Action.accept)
  const [proposalStatus, setProposalStatus] = useState<Status>(proposal.status)
  const [reviewsExpanded, setReviewsExpanded] = useState(false)

  // Set initial state based on screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setReviewsExpanded(window.innerWidth >= 1024) // lg breakpoint
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)

    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // Find current user's review
  const currentUserReview = currentUser
    ? reviews.find(
        (review) =>
          typeof review.reviewer === 'object' &&
          '_id' in review.reviewer &&
          review.reviewer._id === currentUser._id,
      )
    : undefined

  const handleReviewSubmit = (newReview: Review) => {
    // Ensure the reviewer is set to the current user
    newReview.reviewer = currentUser!

    setReviews((prevReviews) => {
      const existingReviewIndex = prevReviews.findIndex(
        (review) =>
          typeof review.reviewer === 'object' &&
          '_id' in review.reviewer &&
          review.reviewer._id === currentUser!._id,
      )

      if (existingReviewIndex !== -1) {
        // Update existing review
        const updatedReviews = [...prevReviews]
        updatedReviews[existingReviewIndex] = {
          ...prevReviews[existingReviewIndex],
          comment: newReview.comment,
          score: newReview.score,
          _updatedAt: new Date().toISOString(),
        }
        return updatedReviews
      } else {
        // Add new review
        return [
          ...prevReviews,
          {
            ...newReview,
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString(),
          },
        ]
      }
    })
  }

  const handleAction = (action: Action) => {
    setSelectedAction(action)
    setActionModalOpen(true)
  }

  const handleActionComplete = (proposalId: string, newStatus: Status) => {
    setProposalStatus(newStatus)
    // Optionally refresh the page or update the UI
    window.location.reload()
  }

  const canApprove = proposalStatus === Status.submitted
  const canRemind = proposalStatus === Status.accepted
  const canReject =
    proposalStatus === Status.submitted || proposalStatus === Status.accepted

  return (
    <div className="w-full lg:w-96 lg:flex-shrink-0 lg:overflow-y-auto">
      <div className="space-y-4 p-4">
        {/* Admin Actions */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            Admin Actions
          </h3>

          {/* Button Group */}
          <div className="flex w-full rounded-md shadow-sm" role="group">
            {/* Approve or Remind Button */}
            {canApprove ? (
              <button
                onClick={() => handleAction(Action.accept)}
                className="relative inline-flex flex-1 cursor-pointer items-center justify-center gap-x-2 rounded-l-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 focus:z-10 focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
              >
                <CheckIcon className="h-4 w-4" />
                Approve
              </button>
            ) : canRemind ? (
              <button
                onClick={() => handleAction(Action.remind)}
                className="relative inline-flex flex-1 cursor-pointer items-center justify-center gap-x-2 rounded-l-md bg-yellow-600 px-3 py-2 text-sm font-semibold text-white hover:bg-yellow-700 focus:z-10 focus:ring-2 focus:ring-yellow-600 focus:ring-offset-2"
              >
                <BellIcon className="h-4 w-4" />
                Remind
              </button>
            ) : (
              <button
                disabled
                className="relative inline-flex flex-1 cursor-not-allowed items-center justify-center gap-x-2 rounded-l-md bg-green-600 px-3 py-2 text-sm font-semibold text-white opacity-50 focus:z-10 focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
              >
                <CheckIcon className="h-4 w-4" />
                Approve
              </button>
            )}

            {/* Reject Button */}
            <button
              onClick={() => handleAction(Action.reject)}
              disabled={!canReject}
              className={`relative inline-flex flex-1 items-center justify-center gap-x-2 rounded-r-md border-l px-3 py-2 text-sm font-semibold text-white focus:z-10 focus:ring-2 focus:ring-red-600 focus:ring-offset-2 ${
                canReject
                  ? 'cursor-pointer border-red-600 bg-red-600 hover:bg-red-700'
                  : 'cursor-not-allowed border-red-600 bg-red-600 opacity-50'
              }`}
            >
              <XMarkIcon className="h-4 w-4" />
              Reject
            </button>
          </div>

          {/* Status Display */}
          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Current Status:</span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                  proposalStatus === Status.accepted
                    ? 'bg-green-100 text-green-800'
                    : proposalStatus === Status.rejected
                      ? 'bg-red-100 text-red-800'
                      : proposalStatus === Status.submitted
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                }`}
              >
                {proposalStatus.charAt(0).toUpperCase() +
                  proposalStatus.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Review Summary */}
        <ProposalReviewSummary reviews={reviews} />

        {/* Review Form - only show if user is logged in */}
        {currentUser && (
          <ProposalReviewForm
            proposalId={proposal._id}
            existingReview={currentUserReview}
            onReviewSubmit={handleReviewSubmit}
          />
        )}

        {/* Collapsible Reviews List - Default to expanded on desktop, collapsed on mobile */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => setReviewsExpanded(!reviewsExpanded)}
            className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-50 lg:hidden"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              Reviews {reviews.length > 0 && `(${reviews.length})`}
            </h3>
            {reviewsExpanded ? (
              <ChevronUpIcon className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-gray-400" />
            )}
          </button>

          {/* Always show on desktop, conditionally on mobile */}
          <div
            className={`lg:block ${reviewsExpanded ? 'block' : 'hidden lg:block'}`}
          >
            {/* Header for desktop */}
            <div className="hidden p-4 pb-0 lg:block">
              <h3 className="text-lg font-semibold text-gray-900">
                Reviews {reviews.length > 0 && `(${reviews.length})`}
              </h3>
            </div>
            <div className="px-4 pb-4">
              <ProposalReviewList
                reviews={reviews}
                currentUserId={currentUser?._id}
                minimal={true}
              />
            </div>
          </div>
        </div>

        {/* Action Modal */}
        <ProposalActionModal
          open={actionModalOpen}
          close={() => setActionModalOpen(false)}
          proposal={proposal}
          action={selectedAction}
          adminUI={true}
          onAction={handleActionComplete}
        />
      </div>
    </div>
  )
}
