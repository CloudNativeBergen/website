'use client'

import { useState } from 'react'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalReviewSummary } from './ProposalReviewSummary'
import { ProposalReviewForm } from './ProposalReviewForm'
import { ProposalReviewList } from './ProposalReviewList'

interface ProposalReviewPanelProps {
  proposalId: string
  initialReviews: Review[]
  currentUser?: Speaker
}

export function ProposalReviewPanel({
  proposalId,
  initialReviews,
  currentUser,
}: ProposalReviewPanelProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews || [])

  const currentUserReview = currentUser
    ? reviews.find(
        (review) =>
          typeof review.reviewer === 'object' &&
          '_id' in review.reviewer &&
          review.reviewer._id === currentUser._id,
      )
    : undefined

  const handleReviewSubmit = (newReview: Review) => {
    newReview.reviewer = currentUser!

    setReviews((prevReviews) => {
      const existingReviewIndex = prevReviews.findIndex(
        (review) =>
          typeof review.reviewer === 'object' &&
          '_id' in review.reviewer &&
          review.reviewer._id === currentUser!._id,
      )

      if (existingReviewIndex !== -1) {
        const updatedReviews = [...prevReviews]
        updatedReviews[existingReviewIndex] = {
          ...prevReviews[existingReviewIndex],
          comment: newReview.comment,
          score: newReview.score,
          _updatedAt: new Date().toISOString(),
        }
        return updatedReviews
      } else {
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

  return (
    <>
      <div className="space-y-4">
        <ProposalReviewSummary reviews={reviews} />

        {currentUser && (
          <ProposalReviewForm
            proposalId={proposalId}
            existingReview={currentUserReview}
            onReviewSubmit={handleReviewSubmit}
          />
        )}

        <ProposalReviewList
          reviews={reviews}
          currentUserId={currentUser?._id}
        />
      </div>
    </>
  )
}
