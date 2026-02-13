import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LoadingState, BankingDetailsSkeleton } from './LoadingStates'

const meta = {
  title: 'Systems/Speakers/TravelSupport/LoadingStates',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Loading skeleton components for the travel support system. Includes a full-page loading state with spinner and message, and a banking details skeleton placeholder.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const DefaultLoadingState: Story = {
  render: () => <LoadingState />,
}

export const CustomMessage: Story = {
  render: () => <LoadingState message="Loading travel support data..." />,
}

export const BankingDetailsSkel: Story = {
  name: 'Banking Details Skeleton',
  render: () => <BankingDetailsSkeleton />,
  parameters: {
    docs: {
      description: {
        story: 'Skeleton placeholder for banking details fields while loading.',
      },
    },
  },
}
