import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  WidgetSkeleton,
  WidgetEmptyState,
  WidgetErrorState,
  ProgressBar,
} from './shared'

/**
 * Shared widget states rendered WITHOUT a fixed-height container — exactly
 * the single-column (mobile) situation where the grid row is auto-height and
 * a bare `h-full` used to collapse these states to zero height.
 */
const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/WidgetStates',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Shared loading / empty / error states from widgets/shared.tsx, shown in an auto-height (mobile, single-column) container to verify their minimum heights, plus the accessible ProgressBar.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const MobileStates: Story = {
  render: () => (
    <div className="flex w-full flex-col gap-4">
      <WidgetSkeleton />
      <WidgetEmptyState message="No proposals yet" />
      <WidgetErrorState onRetry={() => {}} />
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <ProgressBar value={62} label="Review progress" />
      </div>
    </div>
  ),
}
