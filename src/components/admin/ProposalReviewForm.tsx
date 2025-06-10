'use client'

import { useState } from 'react'
import { StarIcon } from '@heroicons/react/24/solid'
import { PaperAirplaneIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { Review, ReviewBase } from '@/lib/review/types'
import { postReview } from '@/lib/review/client'
import { fetchNextUnreviewedProposal } from '@/lib/proposal/client'
import { useRouter } from 'next/navigation'

interface ProposalReviewFormProps {
  proposalId: string
  existingReview?: Review
  onReviewSubmit: (review: Review) => void
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export function ProposalReviewForm({
  proposalId,
  existingReview,
  onReviewSubmit
}: ProposalReviewFormProps) {
  const router = useRouter()
  const [ratings, setRatings] = useState<{ content: number; relevance: number; speaker: number }>(
    existingReview?.score || { content: 0, relevance: 0, speaker: 0 }
  )
  const [hovered, setHovered] = useState<{ content: number; relevance: number; speaker: number }>({
    content: 0,
    relevance: 0,
    speaker: 0,
  })
  const [comment, setComment] = useState<string>(existingReview?.comment || '')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [isLoadingNext, setIsLoadingNext] = useState<boolean>(false)

  const submitHandler = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const reviewData: ReviewBase = {
      comment,
      score: ratings,
    }

    try {
      const res = await postReview(proposalId, reviewData)

      if (res.reviewError || !res.review) {
        console.error('Error submitting review:', res.reviewError)
        return
      }

      onReviewSubmit(res.review)
    } catch (error) {
      console.error('Error submitting review:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNextProposal = async () => {
    setIsLoadingNext(true)
    try {
      const { nextProposal, error } = await fetchNextUnreviewedProposal(proposalId)

      if (error) {
        console.error('Error fetching next unreviewed proposal:', error)
        alert('Failed to fetch next unreviewed proposal.')
        setIsLoadingNext(false)
        return
      }

      if (nextProposal) {
        // Navigate to the next unreviewed proposal
        router.push(`/admin/proposals/${nextProposal._id}`)
      } else {
        // Show notification that there are no more unreviewed proposals
        alert('No more unreviewed proposals available.')
        setIsLoadingNext(false)
      }
    } catch (error) {
      console.error('Error fetching next unreviewed proposal:', error)
      alert('Failed to fetch next unreviewed proposal.')
      setIsLoadingNext(false)
    }
  }

  const scoreCategories = [
    { key: 'content', label: 'Content' },
    { key: 'relevance', label: 'Relevance' },
    { key: 'speaker', label: 'Speaker' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        {existingReview ? 'Update My Review' : 'Add My Review'}
      </h3>

      <form onSubmit={submitHandler} className="space-y-4">
        {/* Rating Categories */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 sr-only">Scores</label>
          {scoreCategories.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 w-24 flex-shrink-0">{label}</span>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={classNames(
                        'p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500',
                        (hovered[key as keyof typeof hovered] || ratings[key as keyof typeof ratings]) >= star
                          ? 'text-yellow-400'
                          : 'text-gray-300 hover:text-yellow-300'
                      )}
                      onMouseEnter={() => {
                        setHovered((h) => ({ ...h, [key]: star }))
                      }}
                      onMouseLeave={() => {
                        setHovered((h) => ({ ...h, [key]: 0 }))
                      }}
                      onClick={() => {
                        setRatings((r) => ({ ...r, [key]: star }))
                      }}
                    >
                      <StarIcon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
                <span className="text-sm text-gray-500 w-8 text-right">
                  {ratings[key as keyof typeof ratings]}/5
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Comment */}
        <div>
          <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
            Comment
          </label>
          <textarea
            id="comment"
            name="comment"
            rows={3}
            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            placeholder="Write your review comments here..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={handleNextProposal}
            disabled={isLoadingNext}
            className="inline-flex items-center gap-x-2 rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightIcon className="h-4 w-4" />
            {isLoadingNext ? 'Loading...' : 'Next'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || Object.values(ratings).some(r => r === 0)}
            className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {isSubmitting ? 'Submitting...' : existingReview ? 'Update Review' : 'Submit Review'}
          </button>
        </div>
      </form>
    </div>
  )
}
