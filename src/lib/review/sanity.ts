import { clientWrite } from '@/lib/sanity/client'
import { Review, ReviewBase } from './types'

export async function updateReview(
  reviewId: string,
  speakerId: string,
  review: ReviewBase,
): Promise<{ review?: Review; reviewError: Error | null }> {
  let reviewError = null
  let updatedReview: Review | undefined

  try {
    updatedReview = (await clientWrite
      .patch(reviewId)
      .set({
        ...review,
        reviewer: { _type: 'reference', _ref: speakerId },
      })
      .commit()) as Review
  } catch (error) {
    reviewError = error as Error
  }

  return { review: updatedReview, reviewError }
}

export async function createReview(
  proposalId: string,
  speakerId: string,
  review: ReviewBase,
): Promise<{ review?: Review; reviewError: Error | null }> {
  let reviewError = null
  let createdReview: Review | undefined

  try {
    createdReview = (await clientWrite.create({
      ...review,
      _type: 'review',
      proposal: { _type: 'reference', _ref: proposalId },
      reviewer: { _type: 'reference', _ref: speakerId },
    })) as Review
  } catch (error) {
    reviewError = error as Error
  }

  return { review: createdReview, reviewError }
}
