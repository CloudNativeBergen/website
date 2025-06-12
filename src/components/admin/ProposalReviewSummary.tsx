'use client'

import { StarIcon } from '@heroicons/react/24/solid'
import { StarIcon as StarIconOutline } from '@heroicons/react/24/outline'
import { Review } from '@/lib/review/types'
import clsx from 'clsx'

interface ProposalReviewSummaryProps {
  reviews: Review[]
}

export function ProposalReviewSummary({ reviews }: ProposalReviewSummaryProps) {
  const averageScores = reviews.length > 0 ? {
    content: reviews.reduce((acc, review) => acc + review.score.content, 0) / reviews.length,
    relevance: reviews.reduce((acc, review) => acc + review.score.relevance, 0) / reviews.length,
    speaker: reviews.reduce((acc, review) => acc + review.score.speaker, 0) / reviews.length,
  } : { content: 0, relevance: 0, speaker: 0 }

  const overallAverage = reviews.length > 0
    ? (averageScores.content + averageScores.relevance + averageScores.speaker) / 3
    : 0

  const scoreCategories = [
    { key: 'content', label: 'Content', score: averageScores.content },
    { key: 'relevance', label: 'Relevance', score: averageScores.relevance },
    { key: 'speaker', label: 'Speaker', score: averageScores.speaker },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Review Summary</h3>

      {reviews.length === 0 ? (
        <p className="text-gray-500 text-sm">No reviews yet</p>
      ) : (
        <div className="space-y-3">
          {/* Overall Score */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-900">Overall Score</span>
              <span className="text-lg font-semibold text-gray-900">
                {overallAverage.toFixed(1)}/5
              </span>
            </div>
            <div className="flex items-center space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                star <= Math.round(overallAverage) ? (
                  <StarIcon
                    key={star}
                    className="h-4 w-4 text-yellow-400"
                  />
                ) : (
                  <StarIconOutline
                    key={star}
                    className="h-4 w-4 text-gray-300"
                  />
                )
              ))}
              <span className="ml-2 text-sm text-gray-500">
                ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
              </span>
            </div>
          </div>

          {/* Individual Categories */}
          <div className="space-y-2">
            {scoreCategories.map(({ key, label, score }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 w-28">{label}</span>
                <div className="flex items-center space-x-2 flex-1">
                  <div className="flex items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <StarIcon
                        key={star}
                        className={clsx(
                          star <= Math.round(score) ? 'text-yellow-400' : 'text-gray-300',
                          'h-3 w-3'
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-gray-900 ml-2">
                    {score.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
