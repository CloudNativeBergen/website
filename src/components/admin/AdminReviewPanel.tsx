'use client'

import { useState, useEffect } from 'react'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'
import { AdminReviewSummary } from './AdminReviewSummary'
import { AdminReviewForm } from './AdminReviewForm'
import { AdminReviewList } from './AdminReviewList'

interface AdminReviewPanelProps {
  proposalId: string
  initialReviews: Review[]
  currentUser?: Speaker
}

export function AdminReviewPanel({
  proposalId,
  initialReviews,
  currentUser
}: AdminReviewPanelProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews || [])

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

  return (
    <div className="w-96 flex-shrink-0 overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Review Summary */}
        <AdminReviewSummary reviews={reviews} />

        {/* Review Form - only show if user is logged in */}
        {currentUser && (
          <AdminReviewForm
            proposalId={proposalId}
            currentUser={currentUser}
            existingReview={currentUserReview}
            onReviewSubmit={handleReviewSubmit}
          />
        )}

        {/* Reviews List */}
        <AdminReviewList
          reviews={reviews}
          currentUserId={currentUser?._id}
        />
      </div>
    </div>
  )
}
