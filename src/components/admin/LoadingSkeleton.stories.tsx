import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  SkeletonCard,
  SkeletonTable,
  SkeletonSearchResult,
  SkeletonProposalDetail,
  SkeletonModal,
  SkeletonGrid,
} from './LoadingSkeleton'

const meta = {
  title: 'Components/Feedback/LoadingSkeleton',
  component: SkeletonCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A collection of skeleton loading components for various UI patterns. Use these to show loading states while content is being fetched.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SkeletonCard>

export default meta
type Story = StoryObj<typeof meta>

export const Card: Story = {
  args: {
    showHeader: true,
    rows: 3,
  },
}

export const CardWithoutHeader: Story = {
  args: {
    showHeader: false,
    rows: 4,
  },
}

export const Table: Story = {
  render: () => <SkeletonTable rows={5} columns={4} />,
  args: {},
}

export const WideTable: Story = {
  render: () => <SkeletonTable rows={8} columns={6} />,
  args: {},
}

export const SearchResult: Story = {
  render: () => <SkeletonSearchResult items={3} />,
  args: {},
}

export const ProposalDetail: Story = {
  render: () => <SkeletonProposalDetail />,
  args: {},
}

export const Modal: Story = {
  render: () => (
    <div className="max-w-md rounded-lg bg-white p-6 shadow dark:bg-gray-800">
      <SkeletonModal showHeader={true} showFooter={true} contentRows={3} />
    </div>
  ),
  args: {},
}

export const ModalWithoutFooter: Story = {
  render: () => (
    <div className="max-w-md rounded-lg bg-white p-6 shadow dark:bg-gray-800">
      <SkeletonModal showHeader={true} showFooter={false} contentRows={4} />
    </div>
  ),
  args: {},
}

export const Grid: Story = {
  render: () => <SkeletonGrid items={6} columns={3} cardHeight="h-32" />,
  args: {},
}

export const CompactGrid: Story = {
  render: () => <SkeletonGrid items={4} columns={2} cardHeight="h-24" />,
  args: {},
}

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
          Card Skeleton
        </h3>
        <div className="max-w-md">
          <SkeletonCard />
        </div>
      </div>

      <div>
        <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
          Table Skeleton
        </h3>
        <SkeletonTable rows={3} columns={4} />
      </div>

      <div>
        <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
          Search Results Skeleton
        </h3>
        <div className="max-w-md">
          <SkeletonSearchResult items={2} />
        </div>
      </div>

      <div>
        <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
          Grid Skeleton
        </h3>
        <SkeletonGrid items={4} columns={4} cardHeight="h-20" />
      </div>
    </div>
  ),
  args: {},
}
