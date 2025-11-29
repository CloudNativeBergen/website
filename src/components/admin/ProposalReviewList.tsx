'use client'

import { StarIcon } from '@heroicons/react/24/solid'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'
import { sanityImage } from '@/lib/sanity/client'
import { formatDateSafe } from '@/lib/time'

interface ProposalReviewListProps {
  reviews: Review[]
  currentUserId?: string
  minimal?: boolean
}

import clsx from 'clsx'

export function ProposalReviewList({
  reviews,
  currentUserId,
  minimal = false,
}: ProposalReviewListProps) {
  if (reviews.length === 0) {
    if (minimal) {
      return (
        <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
          No reviews yet
        </p>
      )
    }
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Reviews
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No reviews yet
        </p>
      </div>
    )
  }

  const sortedReviews = [...reviews].sort((a, b) => {
    const aIsCurrentUser =
      typeof a.reviewer === 'object' &&
      '_id' in a.reviewer &&
      a.reviewer._id === currentUserId
    const bIsCurrentUser =
      typeof b.reviewer === 'object' &&
      '_id' in b.reviewer &&
      b.reviewer._id === currentUserId

    if (aIsCurrentUser && !bIsCurrentUser) return -1
    if (!aIsCurrentUser && bIsCurrentUser) return 1

    return new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime()
  })

  const renderReviewItems = () => (
    <div className="space-y-4">
      {sortedReviews.map((review, index) => {
        const reviewer =
          typeof review.reviewer === 'object' && 'name' in review.reviewer
            ? (review.reviewer as Speaker)
            : null

        const isCurrentUserReview = reviewer && reviewer._id === currentUserId

        return (
          <div
            key={review._id || index}
            className={clsx(
              'rounded-lg border p-3',
              isCurrentUserReview
                ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-400/30 dark:bg-indigo-900/20'
                : 'border-gray-200 dark:border-gray-700 dark:bg-gray-800',
            )}
          >
            {/* Reviewer Info */}
            <div className="mb-3 flex items-start space-x-3">
              <div className="shrink-0">
                {reviewer?.image ? (
                  <img
                    src={sanityImage(reviewer.image)
                      .width(64)
                      .height(64)
                      .fit('crop')
                      .url()}
                    alt={reviewer.name || 'Reviewer'}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {reviewer?.name?.charAt(0) || 'U'}
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="space-y-1">
                  <div className="flex items-center">
                    <h4
                      className={clsx(
                        'text-sm font-medium',
                        isCurrentUserReview
                          ? 'text-indigo-900 dark:text-indigo-200'
                          : 'text-gray-900 dark:text-white',
                      )}
                    >
                      {reviewer?.name || 'Unknown Reviewer'}
                    </h4>
                    {isCurrentUserReview && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                        You
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDateSafe(review._createdAt)}
                  </time>
                </div>
              </div>
            </div>

            {/* Scores */}
            <div className="mb-3 space-y-1">
              {[
                { key: 'content', label: 'Content' },
                { key: 'relevance', label: 'Relevance' },
                { key: 'speaker', label: 'Speaker' },
              ].map(({ key, label }) => {
                const score = review.score[key as keyof typeof review.score]
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="w-24 text-sm text-gray-600 dark:text-gray-300">
                      {label}
                    </span>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <StarIcon
                            key={star}
                            className={clsx(
                              star <= score
                                ? 'text-yellow-400'
                                : 'text-gray-300 dark:text-gray-600',
                              'h-3 w-3',
                            )}
                          />
                        ))}
                      </div>
                      <span className="w-6 text-sm font-medium text-gray-900 dark:text-white">
                        {score}/5
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Comment */}
            {review.comment && (
              <div className="border-t pt-2 dark:border-gray-600">
                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {review.comment}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  if (minimal) {
    return renderReviewItems()
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
        Reviews ({reviews.length})
      </h3>
      {renderReviewItems()}
    </div>
  )
}
