'use client'

import { useState } from 'react'
import { StarIcon } from '@heroicons/react/24/solid'
import { PaperAirplaneIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { Review, ReviewBase } from '@/lib/review/types'
import { adminPostReview } from '@/lib/review/client'
import { adminFetchNextUnreviewedProposal } from '@/lib/proposal'
import { useNotification } from './NotificationProvider'
import { Textarea } from '@/components/Form'
import { AdminButton } from '@/components/admin/AdminButton'
import { useRouter } from 'next/navigation'

interface ProposalReviewFormProps {
  proposalId: string
  existingReview?: Review
  onReviewSubmit: (review: Review) => void
}

import clsx from 'clsx'

export function ProposalReviewForm({
  proposalId,
  existingReview,
  onReviewSubmit,
}: ProposalReviewFormProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [ratings, setRatings] = useState<{
    content: number
    relevance: number
    speaker: number
  }>(existingReview?.score || { content: 0, relevance: 0, speaker: 0 })
  const [hovered, setHovered] = useState<{
    content: number
    relevance: number
    speaker: number
  }>({
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
      const res = await adminPostReview(proposalId, reviewData)

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
      const { nextProposal, error } =
        await adminFetchNextUnreviewedProposal(proposalId)

      if (error) {
        console.error('Error fetching next unreviewed proposal:', error)
        showNotification({
          type: 'error',
          title: 'Failed to load next proposal',
          message: 'There was an error fetching the next unreviewed proposal.',
        })
        setIsLoadingNext(false)
        return
      }

      if (nextProposal) {
        router.push(`/admin/proposals/${nextProposal._id}`)
      } else {
        showNotification({
          type: 'info',
          title: 'All proposals reviewed',
          message: 'No more unreviewed proposals available.',
        })
        setIsLoadingNext(false)
      }
    } catch (error) {
      console.error('Error fetching next unreviewed proposal:', error)
      showNotification({
        type: 'error',
        title: 'Failed to load next proposal',
        message: 'There was an error fetching the next unreviewed proposal.',
      })
      setIsLoadingNext(false)
    }
  }

  const scoreCategories = [
    { key: 'content', label: 'Content' },
    { key: 'relevance', label: 'Relevance' },
    { key: 'speaker', label: 'Speaker' },
  ]

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
        {existingReview ? 'Update My Review' : 'Add My Review'}
      </h3>

      <form onSubmit={submitHandler} className="space-y-4">
        {/* Rating Categories */}
        <div className="space-y-2">
          <label className="sr-only block text-sm font-medium text-gray-700 dark:text-gray-300">
            Scores
          </label>
          {scoreCategories.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="w-24 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}
              </span>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={clsx(
                        'rounded p-0.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none',
                        (hovered[key as keyof typeof hovered] ||
                          ratings[key as keyof typeof ratings]) >= star
                          ? 'text-yellow-400'
                          : 'text-gray-300 hover:text-yellow-300 dark:text-gray-600 dark:hover:text-yellow-400',
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
                <span className="w-8 text-right text-sm text-gray-500 dark:text-gray-400">
                  {ratings[key as keyof typeof ratings]}/5
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Comment */}
        <div>
          <Textarea
            name="comment"
            label="Comment"
            rows={3}
            value={comment}
            setValue={setComment}
            placeholder="Write your review comments here..."
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-2">
          <AdminButton
            variant="secondary"
            onClick={handleNextProposal}
            disabled={isLoadingNext}
          >
            <ArrowRightIcon className="h-4 w-4" />
            {isLoadingNext ? 'Loading...' : 'Next'}
          </AdminButton>
          <AdminButton
            type="submit"
            disabled={
              isSubmitting || Object.values(ratings).some((r) => r === 0)
            }
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {isSubmitting
              ? 'Submitting...'
              : existingReview
                ? 'Update Review'
                : 'Submit Review'}
          </AdminButton>
        </div>
      </form>
    </div>
  )
}
