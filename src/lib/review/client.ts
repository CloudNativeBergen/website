import { Review, ReviewBase } from '@/lib/review/types'

export async function adminPostReview(proposalId: string, review: ReviewBase) {
  const res = await fetch(`/admin/api/proposals/${proposalId}/review`, {
    next: { revalidate: 0 },
    cache: 'no-store',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(review),
  })

  return (await res.json()) as {
    review: Review | null
    reviewError: Error | null
  }
}
