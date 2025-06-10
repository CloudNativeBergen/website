'use client'

import { StarIcon } from '@heroicons/react/24/solid'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'
import { sanityImage } from '@/lib/sanity/client'
import { formatDateSafe } from '@/lib/time'

interface ProposalReviewListProps {
  reviews: Review[]
  currentUserId?: string
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export function ProposalReviewList({ reviews, currentUserId }: ProposalReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Reviews</h3>
        <p className="text-gray-500 text-sm">No reviews yet</p>
      </div>
    )
  }

  const sortedReviews = [...reviews].sort((a, b) => {
    // Put current user's review first
    const aIsCurrentUser = typeof a.reviewer === 'object' && '_id' in a.reviewer && a.reviewer._id === currentUserId
    const bIsCurrentUser = typeof b.reviewer === 'object' && '_id' in b.reviewer && b.reviewer._id === currentUserId

    if (aIsCurrentUser && !bIsCurrentUser) return -1
    if (!aIsCurrentUser && bIsCurrentUser) return 1

    // Then sort by creation date (newest first)
    return new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime()
  })

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Reviews ({reviews.length})
      </h3>

      <div className="space-y-4">
        {sortedReviews.map((review, index) => {
          const reviewer = typeof review.reviewer === 'object' && 'name' in review.reviewer
            ? review.reviewer as Speaker
            : null

          const isCurrentUserReview = reviewer && reviewer._id === currentUserId

          return (
            <div
              key={review._id || index}
              className={classNames(
                'border rounded-lg p-3',
                isCurrentUserReview
                  ? 'border-indigo-200 bg-indigo-50'
                  : 'border-gray-200'
              )}
            >
              {/* Reviewer Info */}
              <div className="flex items-start space-x-3 mb-3">
                <div className="flex-shrink-0">
                  {reviewer?.image ? (
                    <img
                      src={sanityImage(reviewer.image).width(64).height(64).fit('crop').url()}
                      alt={reviewer.name || 'Reviewer'}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-500">
                        {reviewer?.name?.charAt(0) || 'U'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="space-y-1">
                    <div className="flex items-center">
                      <h4 className={classNames(
                        'text-sm font-medium',
                        isCurrentUserReview ? 'text-indigo-900' : 'text-gray-900'
                      )}>
                        {reviewer?.name || 'Unknown Reviewer'}
                      </h4>
                      {isCurrentUserReview && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                          You
                        </span>
                      )}
                    </div>
                    <time className="text-xs text-gray-500">
                      {formatDateSafe(review._createdAt)}
                    </time>
                  </div>
                </div>
              </div>

              {/* Scores */}
              <div className="space-y-1 mb-3">
                {[
                  { key: 'content', label: 'Content' },
                  { key: 'relevance', label: 'Relevance' },
                  { key: 'speaker', label: 'Speaker' },
                ].map(({ key, label }) => {
                  const score = review.score[key as keyof typeof review.score]
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 w-24">{label}</span>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <StarIcon
                              key={star}
                              className={classNames(
                                star <= score ? 'text-yellow-400' : 'text-gray-300',
                                'h-3 w-3'
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-6">
                          {score}/5
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Comment */}
              {review.comment && (
                <div className="border-t pt-2">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {review.comment}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
