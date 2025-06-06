import { Review } from '@/lib/review/types';

/**
 * Calculates the average score from an array of reviews
 * The score is calculated by taking the average of content, relevance, and speaker scores
 * across all reviews
 *
 * @param reviews Array of Review objects
 * @returns Average score as a number between 0 and 5, or 0 if no reviews
 */
export function getAverageScore(reviews: Review[]): number {
  if (!reviews || reviews.length === 0) return 0;

  const totalScore = reviews.reduce(
    (acc, review) =>
      acc +
      review.score.content +
      review.score.relevance +
      review.score.speaker,
    0,
  );

  return (totalScore / reviews.length) / 3;
}

/**
 * Returns a color class based on the score value
 *
 * @param score The score value (0-5)
 * @returns CSS class name for the appropriate color
 */
export function getScoreColorClass(score: number): string {
  if (score < 3) {
    return 'text-red-500';
  } else if (score >= 3 && score < 4) {
    return 'text-orange-500';
  } else if (score >= 4) {
    return 'text-green-500';
  }
  return 'text-gray-500'; // Default color
}
