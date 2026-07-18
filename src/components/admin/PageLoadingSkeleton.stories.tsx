import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'
import {
  AdminPageLoading,
  AdminTablePageLoading,
  AdminDashboardLoading,
  AdminScheduleLoading,
} from './PageLoadingSkeleton'

/**
 * Full-page admin loading skeletons (the `loading.tsx` route fallbacks). These
 * must mirror their real page at BOTH mobile and desktop widths — use the
 * Storybook viewport toolbar (or `pnpm shoot`) to check the phone layout, which
 * is where the schedule/table skeletons previously diverged from the real UI.
 */
const meta = {
  title: 'Admin/Feedback/PageLoadingSkeleton',
  component: AdminTablePageLoading,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AdminTablePageLoading>

export default meta
type Story = StoryObj<typeof meta>

// The admin route layout pads its content `p-2 py-8 sm:p-4 lg:p-8`; wrap each
// skeleton in it so the story matches the real `loading.tsx` context. (The
// schedule skeleton cancels this with negative margins to go full-bleed, which
// is exactly why it needs the same padded frame here to look right.)
const AdminFrame = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-gray-50 p-2 py-8 sm:p-4 lg:p-8 dark:bg-gray-900">
    {children}
  </div>
)

/**
 * The schedule editor's fallback. Below `md` it mirrors MobileScheduleView's
 * time-rail carousel (sticky header + track pills + a single full-width panel
 * with a left time gutter); at `md+` it is the desktop sidebar + track board.
 */
export const Schedule: Story = {
  render: () => (
    <AdminFrame>
      <AdminScheduleLoading />
    </AdminFrame>
  ),
}

/** Table pages: stat cards + a table on desktop, a stacked card list on mobile. */
export const TablePage: Story = {
  render: () => (
    <AdminFrame>
      <AdminTablePageLoading />
    </AdminFrame>
  ),
}

/** Dashboard: widget grid that stacks toward one column on phones. */
export const Dashboard: Story = {
  render: () => (
    <AdminFrame>
      <AdminDashboardLoading />
    </AdminFrame>
  ),
}

/** Generic header + stacked cards page fallback. */
export const Page: Story = {
  render: () => (
    <AdminFrame>
      <AdminPageLoading />
    </AdminFrame>
  ),
}
