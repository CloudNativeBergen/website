import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalReviewList } from './ProposalReviewList'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'

const createMockSpeaker = (id: string, name: string, email: string): Speaker =>
  ({
    _id: id,
    _rev: 'rev1',
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-01T00:00:00Z',
    name,
    email,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
  }) as Speaker

const mockReviewers: Speaker[] = [
  createMockSpeaker('reviewer-1', 'Anna Hansen', 'anna@conference.no'),
  createMockSpeaker('reviewer-2', 'Erik Larsen', 'erik@conference.no'),
  createMockSpeaker('reviewer-3', 'Sofia Berg', 'sofia@conference.no'),
]

const createMockReview = (
  id: string,
  reviewer: Speaker,
  score: { content: number; relevance: number; speaker: number },
  comment: string,
  createdAt: string = '2025-01-15T10:00:00Z',
): Review => ({
  _id: id,
  _rev: 'rev1',
  _createdAt: createdAt,
  _updatedAt: createdAt,
  comment,
  score,
  reviewer,
  proposal: { _ref: 'proposal-1', _type: 'reference' },
})

const mockReviews: Review[] = [
  createMockReview(
    'review-1',
    mockReviewers[0],
    { content: 5, relevance: 4, speaker: 5 },
    'Excellent proposal! Very relevant topic for the community.',
    '2025-01-15T10:00:00Z',
  ),
  createMockReview(
    'review-2',
    mockReviewers[1],
    { content: 4, relevance: 5, speaker: 4 },
    'Good technical depth, speaker has strong experience.',
    '2025-01-14T14:30:00Z',
  ),
  createMockReview(
    'review-3',
    mockReviewers[2],
    { content: 4, relevance: 4, speaker: 3 },
    'Solid content, would benefit from more real-world examples.',
    '2025-01-13T09:15:00Z',
  ),
]

const meta: Meta<typeof ProposalReviewList> = {
  title: 'Systems/Proposals/Admin/ProposalReviewList',
  component: ProposalReviewList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays a list of reviews for a proposal. Shows reviewer avatars, names, scores by category (content, relevance, speaker), and comments. Highlights the current user\'s review with a "You" badge.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalReviewList>

export const Default: Story = {
  args: {
    reviews: mockReviews,
  },
}

export const WithCurrentUser: Story = {
  args: {
    reviews: mockReviews,
    currentUserId: 'reviewer-1',
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

export const MinimalMode: Story = {
  args: {
    reviews: mockReviews,
    minimal: true,
  },
}

export const MinimalNoReviews: Story = {
  args: {
    reviews: [],
    minimal: true,
  },
}

export const CurrentUserMinimal: Story = {
  args: {
    reviews: mockReviews,
    currentUserId: 'reviewer-2',
    minimal: true,
  },
}

export const NoComment: Story = {
  args: {
    reviews: [
      createMockReview(
        'review-no-comment',
        mockReviewers[0],
        { content: 3, relevance: 4, speaker: 3 },
        '',
      ),
    ],
  },
}

export const MixedScores: Story = {
  args: {
    reviews: [
      createMockReview(
        'review-high',
        mockReviewers[0],
        { content: 5, relevance: 5, speaker: 5 },
        'Must have talk!',
        '2025-01-15T10:00:00Z',
      ),
      createMockReview(
        'review-mid',
        mockReviewers[1],
        { content: 3, relevance: 3, speaker: 3 },
        'Average proposal.',
        '2025-01-14T10:00:00Z',
      ),
      createMockReview(
        'review-low',
        mockReviewers[2],
        { content: 1, relevance: 2, speaker: 2 },
        'Not a good fit for this conference.',
        '2025-01-13T10:00:00Z',
      ),
    ],
  },
}
