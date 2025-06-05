import { Review, ReviewBase } from '@/lib/review/types';

export async function postReview(proposalId: string, review: ReviewBase) {
  const res = await fetch(`/api/proposal/${proposalId}/review`, {
    next: { revalidate: 0 },
    cache: 'no-store',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(review),
  })

  return (await res.json()) as { review: Review | null; reviewError: Error | null }
}
