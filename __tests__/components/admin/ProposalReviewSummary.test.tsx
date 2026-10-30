/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ProposalReviewSummary } from '@/components/admin/ProposalReviewSummary'
import type { Review } from '@/lib/review/types'

describe('ProposalReviewSummary', () => {
  it('averages only scored reviews and survives one saved without a score', () => {
    const reviews = [
      { _id: 'r1', score: { content: 4, relevance: 4, speaker: 4 } },
      { _id: 'r2' },
    ] as unknown as Review[]
    render(<ProposalReviewSummary reviews={reviews} />)
    expect(screen.getByText('4.0/5')).toBeInTheDocument()
  })
})
