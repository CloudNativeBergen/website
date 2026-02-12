import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalReviewPanel } from './ProposalReviewPanel'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'
import { fn } from 'storybook/test'

const mockCurrentUser: Speaker = {
  _id: 'current-user',
  _rev: '1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  name: 'Current Reviewer',
  email: 'reviewer@example.com',
  slug: 'current-reviewer',
}

const mockReviewers: Speaker[] = [
  {
    _id: 'reviewer-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Hans Reviewer',
    email: 'hans@example.com',
    slug: 'hans-reviewer',
  },
  {
    _id: 'reviewer-2',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Maria Reviewer',
    email: 'maria@example.com',
    slug: 'maria-reviewer',
  },
]

const mockReviews: Review[] = [
  {
    _id: 'review-1',
    _rev: '1',
    _createdAt: '2025-01-10T10:00:00Z',
    _updatedAt: '2025-01-10T10:00:00Z',
    comment:
      'Excellent topic choice. The outline is well-structured and the speaker has strong experience.',
    score: { content: 5, relevance: 5, speaker: 4 },
    reviewer: mockReviewers[0],
    proposal: { _ref: 'proposal-1', _type: 'reference' },
  },
  {
    _id: 'review-2',
    _rev: '1',
    _createdAt: '2025-01-12T14:00:00Z',
    _updatedAt: '2025-01-12T14:00:00Z',
    comment:
      'Good proposal. Would like to see more focus on practical examples rather than theory.',
    score: { content: 3, relevance: 4, speaker: 4 },
    reviewer: mockReviewers[1],
    proposal: { _ref: 'proposal-1', _type: 'reference' },
  },
]

const meta: Meta<typeof ProposalReviewPanel> = {
  title: 'Systems/Proposals/Admin/ProposalReviewPanel',
  component: ProposalReviewPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A composite review panel that brings together the review summary, review form, and review list. Used as the sidebar on the proposal detail page. Also handles the proposal action modal triggered via custom events.',
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
        <div className="w-96">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalReviewPanel>

export const WithReviews: Story = {
  args: {
    proposalId: 'proposal-1',
    initialReviews: mockReviews,
    currentUser: mockCurrentUser,
  },
}

export const EmptyReviews: Story = {
  args: {
    proposalId: 'proposal-1',
    initialReviews: [],
    currentUser: mockCurrentUser,
  },
}

export const WithExistingUserReview: Story = {
  args: {
    proposalId: 'proposal-1',
    initialReviews: [
      ...mockReviews,
      {
        _id: 'review-current',
        _rev: '1',
        _createdAt: '2025-01-14T09:00:00Z',
        _updatedAt: '2025-01-14T09:00:00Z',
        comment: 'I reviewed this already. Solid talk.',
        score: { content: 4, relevance: 4, speaker: 5 },
        reviewer: mockCurrentUser,
        proposal: { _ref: 'proposal-1', _type: 'reference' },
      },
    ],
    currentUser: mockCurrentUser,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The current user has already submitted a review, so the form shows their existing scores and comment.',
      },
    },
  },
}

export const NoCurrentUser: Story = {
  args: {
    proposalId: 'proposal-1',
    initialReviews: mockReviews,
    currentUser: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'When no current user is provided, the review form is hidden but existing reviews are still displayed.',
      },
    },
  },
}
