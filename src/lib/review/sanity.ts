import { clientWrite } from '@/lib/sanity/client'
import { Review, ReviewBase } from './types'
import { createReference } from '@/lib/sanity/helpers'

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
        reviewer: createReference(speakerId),
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
  conferenceId: string,
  review: ReviewBase,
): Promise<{ review?: Review; reviewError: Error | null }> {
  let reviewError = null
  let createdReview: Review | undefined

  try {
    createdReview = (await clientWrite.create({
      ...review,
      _type: 'review',
      proposal: createReference(proposalId),
      reviewer: createReference(speakerId),
      conference: createReference(conferenceId),
    })) as Review
  } catch (error) {
    reviewError = error as Error
  }

  return { review: createdReview, reviewError }
}
