import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalReviewForm } from './ProposalReviewForm'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { Review } from '@/lib/review/types'
import { fn } from 'storybook/test'

const mockExistingReview: Review = {
  _id: 'review-1',
  _rev: 'rev1',
  _createdAt: '2025-01-15T10:00:00Z',
  _updatedAt: '2025-01-15T10:00:00Z',
  comment: 'Great proposal! The topic is very relevant and well-structured.',
  score: { content: 4, relevance: 5, speaker: 4 },
  reviewer: { _ref: 'speaker-reviewer-1', _type: 'reference' },
  proposal: { _ref: 'proposal-1', _type: 'reference' },
}

const meta: Meta<typeof ProposalReviewForm> = {
  title: 'Systems/Proposals/Admin/ProposalReviewForm',
  component: ProposalReviewForm,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Form for organizers to submit or update their review of a proposal. Includes star ratings for content, relevance, and speaker quality, plus a comment field. Has buttons to submit review and navigate to next unreviewed proposal.',
      },
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        push: fn(),
      },
    },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="max-w-md">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalReviewForm>

export const EmptyForm: Story = {
  args: {
    proposalId: 'proposal-123',
    onReviewSubmit: fn(),
  },
}

export const WithExistingReview: Story = {
  args: {
    proposalId: 'proposal-123',
    existingReview: mockExistingReview,
    onReviewSubmit: fn(),
  },
}

export const WithPartialRatings: Story = {
  args: {
    proposalId: 'proposal-123',
    existingReview: {
      ...mockExistingReview,
      score: { content: 3, relevance: 0, speaker: 4 },
      comment: '',
    },
    onReviewSubmit: fn(),
  },
}

export const LowScoreReview: Story = {
  args: {
    proposalId: 'proposal-123',
    existingReview: {
      ...mockExistingReview,
      score: { content: 2, relevance: 2, speaker: 1 },
      comment:
        'This proposal needs significant improvements. The topic is not very relevant to our audience.',
    },
    onReviewSubmit: fn(),
  },
}

export const HighScoreReview: Story = {
  args: {
    proposalId: 'proposal-123',
    existingReview: {
      ...mockExistingReview,
      score: { content: 5, relevance: 5, speaker: 5 },
      comment:
        'Excellent proposal! Must-have talk for the conference. Speaker is highly experienced.',
    },
    onReviewSubmit: fn(),
  },
}
