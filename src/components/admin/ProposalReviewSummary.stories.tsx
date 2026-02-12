import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalReviewSummary } from './ProposalReviewSummary'
import { Review } from '@/lib/review/types'

const createMockReview = (
  overrides: Partial<Review> & { id: string },
): Review => ({
  _id: overrides.id,
  _rev: 'rev1',
  _createdAt: '2025-01-15T10:00:00Z',
  _updatedAt: '2025-01-15T10:00:00Z',
  comment: overrides.comment || 'Great proposal with solid technical content.',
  score: overrides.score || { content: 4, relevance: 4, speaker: 4 },
  reviewer: { _ref: 'speaker-reviewer-1', _type: 'reference' },
  proposal: { _ref: 'proposal-1', _type: 'reference' },
  ...overrides,
})

const mockReviews: Review[] = [
  createMockReview({
    id: 'review-1',
    score: { content: 5, relevance: 4, speaker: 5 },
    comment: 'Excellent proposal! Very relevant topic for the community.',
  }),
  createMockReview({
    id: 'review-2',
    score: { content: 4, relevance: 5, speaker: 4 },
    comment: 'Good technical depth, speaker has strong experience.',
  }),
  createMockReview({
    id: 'review-3',
    score: { content: 4, relevance: 4, speaker: 3 },
    comment: 'Solid content, would benefit from more real-world examples.',
  }),
]

const meta: Meta<typeof ProposalReviewSummary> = {
  title: 'Systems/Proposals/Admin/ProposalReviewSummary',
  component: ProposalReviewSummary,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays aggregated review scores for a proposal. Shows overall score and breakdown by category (content, relevance, speaker) with star ratings.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalReviewSummary>

export const Default: Story = {
  args: {
    reviews: mockReviews,
  },
}

export const NoReviews: Story = {
  args: {
    reviews: [],
  },
}

export const SingleReview: Story = {
  args: {
    reviews: [mockReviews[0]],
  },
}

export const HighScores: Story = {
  args: {
    reviews: [
      createMockReview({
        id: 'review-high-1',
        score: { content: 5, relevance: 5, speaker: 5 },
      }),
      createMockReview({
        id: 'review-high-2',
        score: { content: 5, relevance: 5, speaker: 4 },
      }),
    ],
  },
}

export const LowScores: Story = {
  args: {
    reviews: [
      createMockReview({
        id: 'review-low-1',
        score: { content: 2, relevance: 2, speaker: 3 },
      }),
      createMockReview({
        id: 'review-low-2',
        score: { content: 1, relevance: 3, speaker: 2 },
      }),
    ],
  },
}

export const MixedScores: Story = {
  args: {
    reviews: [
      createMockReview({
        id: 'review-mixed-1',
        score: { content: 5, relevance: 2, speaker: 4 },
      }),
      createMockReview({
        id: 'review-mixed-2',
        score: { content: 3, relevance: 5, speaker: 2 },
      }),
      createMockReview({
        id: 'review-mixed-3',
        score: { content: 4, relevance: 3, speaker: 5 },
      }),
    ],
  },
}

export const ManyReviews: Story = {
  args: {
    reviews: [
      createMockReview({
        id: 'review-many-1',
        score: { content: 5, relevance: 4, speaker: 5 },
      }),
      createMockReview({
        id: 'review-many-2',
        score: { content: 4, relevance: 5, speaker: 4 },
      }),
      createMockReview({
        id: 'review-many-3',
        score: { content: 4, relevance: 4, speaker: 3 },
      }),
      createMockReview({
        id: 'review-many-4',
        score: { content: 5, relevance: 3, speaker: 4 },
      }),
      createMockReview({
        id: 'review-many-5',
        score: { content: 3, relevance: 4, speaker: 5 },
      }),
    ],
  },
}
