'use client'

import { useState, useEffect } from 'react'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Action } from '@/lib/proposal/types'
import { ProposalReviewSummary } from './ProposalReviewSummary'
import { ProposalReviewForm } from './ProposalReviewForm'
import { ProposalReviewList } from './ProposalReviewList'
import { ProposalActionModal } from './ProposalActionModal'

interface ProposalReviewPanelProps {
  proposalId: string
  initialReviews: Review[]
  currentUser?: Speaker
}

export function ProposalReviewPanel({
  proposalId,
  initialReviews,
  currentUser
}: ProposalReviewPanelProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews || [])
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [selectedAction, setSelectedAction] = useState<Action>(Action.accept)
  const [proposalForAction, setProposalForAction] = useState<ProposalExisting | null>(null)

  // Find current user's review
  const currentUserReview = currentUser
    ? reviews.find(review =>
      typeof review.reviewer === 'object' &&
      '_id' in review.reviewer &&
      review.reviewer._id === currentUser._id
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
          review.reviewer._id === currentUser!._id
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
        return [...prevReviews, {
          ...newReview,
          _createdAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
        }]
      }
    })
  }

  const handleActionComplete = () => {
    // Optionally refresh the page or update the UI
    window.location.reload()
  }

  // Listen for action events from the compact buttons
  useEffect(() => {
    const handleProposalAction = (event: CustomEvent) => {
      if (event.detail.proposal._id === proposalId) {
        setSelectedAction(event.detail.action)
        setProposalForAction(event.detail.proposal)
        setActionModalOpen(true)
      }
    }

    window.addEventListener('proposalAction', handleProposalAction as EventListener)
    return () => window.removeEventListener('proposalAction', handleProposalAction as EventListener)
  }, [proposalId])
  return (
    <>
      <div className="w-full lg:w-96 lg:flex-shrink-0 lg:overflow-y-auto">
        <div className="p-4 lg:p-4 space-y-4">
          {/* Review Summary */}
          <ProposalReviewSummary reviews={reviews} />

          {/* Review Form - only show if user is logged in */}
          {currentUser && (
            <ProposalReviewForm
              proposalId={proposalId}
              existingReview={currentUserReview}
              onReviewSubmit={handleReviewSubmit}
            />
          )}

          {/* Reviews List */}
          <ProposalReviewList
            reviews={reviews}
            currentUserId={currentUser?._id}
          />
        </div>
      </div>

      {/* Action Modal */}
      {proposalForAction && (
        <ProposalActionModal
          open={actionModalOpen}
          close={() => setActionModalOpen(false)}
          proposal={proposalForAction}
          action={selectedAction}
          adminUI={true}
          onAction={handleActionComplete}
        />
      )}
    </>
  )
}
