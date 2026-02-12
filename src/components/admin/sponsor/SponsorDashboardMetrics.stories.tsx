import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Admin/Sponsors/Dashboard/Metrics',
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// Compact metric card variant for display
function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon,
}: {
  title: string
  value: string
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  icon: React.ReactNode
}) {
  const trendColors = {
    up: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    down: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={`rounded-full p-3 ${trend ? trendColors[trend] : trendColors.neutral}`}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

export const Documentation: Story = {
  render: () => (
    <div className="w-full max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="font-space-grotesk text-3xl font-bold text-gray-900 dark:text-white">
          Sponsor Dashboard Metrics
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Displays key sponsor pipeline metrics at a glance. Shows revenue,
          deals, tier utilization, and invoice status.
        </p>
      </div>

      {/* Live Example */}
      <div>
        <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Live Example
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Revenue"
            value="80 000 kr"
            subtitle="0 kr collected"
            trend="up"
            icon={
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
          <MetricCard
            title="Closed Deals"
            value="2"
            subtitle="28 in pipeline"
            trend="up"
            icon={
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
          <MetricCard
            title="Tier Utilization"
            value="2 / 10"
            subtitle="Total sponsors across tiers"
            trend="neutral"
            icon={
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            }
          />
          <MetricCard
            title="Overdue Invoices"
            value="0"
            subtitle="All current"
            trend="neutral"
            icon={
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
        </div>
      </div>

      {/* Usage */}
      <div className="rounded-lg bg-gray-50 p-6 dark:bg-gray-800/50">
        <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Usage
        </h2>
        <pre className="overflow-x-auto rounded-md bg-gray-900 p-4 text-sm text-gray-100">
          {`import { SponsorDashboardMetrics } from '@/components/admin/sponsor'

function DashboardPage({ conferenceId }: { conferenceId: string }) {
  return <SponsorDashboardMetrics conferenceId={conferenceId} />
}`}
        </pre>
      </div>

      {/* Props */}
      <div>
        <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Props
        </h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Prop
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              <tr>
                <td className="px-4 py-3 font-mono text-sm text-gray-900 dark:text-white">
                  conferenceId
                </td>
                <td className="px-4 py-3 font-mono text-sm text-gray-600 dark:text-gray-400">
                  string
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  Conference ID for fetching sponsor metrics
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Features */}
      <div>
        <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Features
        </h2>
        <ul className="grid gap-3 text-gray-600 dark:text-gray-400">
          <li className="flex items-start gap-2">
            <span className="mt-1 text-green-500">✓</span>
            <span>
              <strong>Multi-currency support</strong> - Converts all values to
              NOK for unified display
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-green-500">✓</span>
            <span>
              <strong>Real-time updates</strong> - Uses tRPC + React Query for
              automatic refresh
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-green-500">✓</span>
            <span>
              <strong>Trend indicators</strong> - Visual cues for positive,
              negative, and neutral trends
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-green-500">✓</span>
            <span>
              <strong>Loading states</strong> - Skeleton animations during data
              fetch
            </span>
          </li>
        </ul>
      </div>
    </div>
  ),
}
