import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ErrorDisplay } from '@/components/admin/ErrorDisplay'
import { SkeletonTable } from '@/components/admin/LoadingSkeleton'
import { StatCard, MetricCard, StatsGrid } from '@/components/admin/stats'
import {
  ChartBarIcon,
  UserGroupIcon,
  MegaphoneIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  TicketIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Design System/Examples/Admin Pages',
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Complete admin list page showing the standard layout pattern:
 * AdminPageHeader with stats + action buttons, filter bar, and data table.
 */
export const ListPage: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<ChartBarIcon className="h-full w-full" />}
          title="Sponsor Management"
          description="Manage sponsorships for"
          contextHighlight="Cloud Native Days Norway 2026"
          stats={[
            { value: 24, label: 'Total Sponsors', color: 'blue' },
            { value: 8, label: 'Pending', color: 'yellow' },
            { value: 14, label: 'Confirmed', color: 'green' },
            { value: 2, label: 'Cancelled', color: 'red' },
          ]}
          actionItems={[
            {
              label: 'Add Sponsor',
              icon: <PlusIcon className="h-4 w-4" />,
              onClick: () => {},
            },
            {
              label: 'Export CSV',
              icon: <ArrowDownTrayIcon className="h-4 w-4" />,
              onClick: () => {},
              variant: 'secondary',
            },
          ]}
        />

        {/* Filter bar */}
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search sponsors..."
              className="w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
            />
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <FunnelIcon className="h-4 w-4" />
            Filters
          </button>
        </div>

        {/* Data table */}
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['Company', 'Tier', 'Status', 'Contact', 'Amount'].map(
                  (header) => (
                    <th
                      key={header}
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {[
                {
                  company: 'Elastic',
                  tier: 'Gold',
                  status: 'Confirmed',
                  contact: 'jane@elastic.co',
                  amount: 'NOK 50,000',
                  tierColor:
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
                  statusColor:
                    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                },
                {
                  company: 'Grafana Labs',
                  tier: 'Silver',
                  status: 'Pending',
                  contact: 'ops@grafana.com',
                  amount: 'NOK 30,000',
                  tierColor:
                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
                  statusColor:
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
                },
                {
                  company: 'Isovalent',
                  tier: 'Platinum',
                  status: 'Confirmed',
                  contact: 'events@isovalent.com',
                  amount: 'NOK 80,000',
                  tierColor:
                    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
                  statusColor:
                    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                },
              ].map((row) => (
                <tr
                  key={row.company}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {row.company}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${row.tierColor}`}
                    >
                      {row.tier}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${row.statusColor}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {row.contact}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {row.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/**
 * Admin detail page with back navigation, stat cards, and content sections.
 */
export const DetailPage: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<UserGroupIcon className="h-full w-full" />}
          title="Kelsey Hightower"
          description="Speaker profile and talk management"
          backLink={{
            href: '/admin/speakers',
            label: 'Back to speakers',
          }}
          stats={[
            { value: 3, label: 'Talks Submitted', color: 'blue' },
            { value: 2, label: 'Accepted', color: 'green' },
            { value: 1, label: 'Pending Review', color: 'yellow' },
          ]}
          actionItems={[
            {
              label: 'Send Email',
              icon: <MegaphoneIcon className="h-4 w-4" />,
              onClick: () => {},
            },
          ]}
        />

        {/* Content sections */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Profile card */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
              <h2 className="font-space-grotesk mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Profile
              </h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Email', value: 'kelsey@example.com' },
                  { label: 'Company', value: 'Google' },
                  { label: 'Role', value: 'Staff Developer Advocate' },
                  { label: 'Location', value: 'Portland, OR' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Talks table */}
            <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <h2 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
                  Submitted Talks
                </h2>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {[
                  {
                    title: 'Kubernetes the Hard Way – Live Edition',
                    status: 'Accepted',
                    statusColor:
                      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                  },
                  {
                    title: 'No Code Infrastructure',
                    status: 'Accepted',
                    statusColor:
                      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                  },
                  {
                    title: 'The Future of Service Mesh',
                    status: 'Under Review',
                    statusColor:
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
                  },
                ].map((talk) => (
                  <div
                    key={talk.title}
                    className="flex items-center justify-between px-6 py-4"
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {talk.title}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${talk.statusColor}`}
                    >
                      {talk.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                Quick Actions
              </h3>
              <div className="space-y-2">
                {[
                  'Send Welcome Email',
                  'Generate Speaker Card',
                  'View Public Profile',
                ].map((action) => (
                  <button
                    key={action}
                    type="button"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                Activity
              </h3>
              <div className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                <p>Talk submitted — 2 days ago</p>
                <p>Profile updated — 5 days ago</p>
                <p>Registered — 2 weeks ago</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}

/**
 * Loading state using the skeleton components. Each admin route should
 * export a loading.tsx that renders an appropriate skeleton.
 */
export const LoadingState: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Skeleton header */}
        <div className="animate-pulse pb-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700" />
            <div>
              <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-4 w-96 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-lg bg-gray-200 dark:bg-gray-700"
              />
            ))}
          </div>
        </div>
        <SkeletonTable rows={6} />
      </div>
    </div>
  ),
}

/**
 * Error state using ErrorDisplay. Server components should catch errors
 * early and render this instead of crashing.
 */
export const ErrorState: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <ErrorDisplay
        title="Failed to Load Sponsors"
        message="Could not connect to the database. Please check your connection and try again."
        backLink={{ href: '/admin', label: 'Back to Dashboard' }}
      />
    </div>
  ),
}

/**
 * Empty state pattern for when a list page has no data yet.
 */
export const EmptyState: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<ChartBarIcon className="h-full w-full" />}
          title="Sponsor Management"
          description="Manage sponsorships for"
          contextHighlight="Cloud Native Days Norway 2026"
          actionItems={[
            {
              label: 'Add Sponsor',
              icon: <PlusIcon className="h-4 w-4" />,
              onClick: () => {},
            },
          ]}
        />

        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-16 dark:border-gray-600">
          <ChartBarIcon className="h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            No sponsors yet
          </h3>
          <p className="mt-2 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
            Get started by adding your first sponsor. They&apos;ll appear here
            once added.
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <PlusIcon className="h-4 w-4" />
            Add Sponsor
          </button>
        </div>
      </div>
    </div>
  ),
}

/**
 * Best practices reference showing the standard admin page patterns and
 * component usage guidelines.
 */
export const BestPractices: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-space-grotesk mb-2 text-3xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Admin Page Patterns
        </h1>
        <p className="font-inter mb-10 text-base text-gray-600 dark:text-gray-400">
          Guidelines for building consistent admin interfaces.
        </p>

        {/* Page Structure */}
        <section className="mb-12">
          <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Page Structure
          </h2>
          <p className="font-inter mb-4 text-sm text-gray-600 dark:text-gray-400">
            Every admin page follows a Server Component → Client Component
            pattern. The server component handles auth, data fetching, and error
            boundaries. The client component handles interactivity.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
            {`// app/(admin)/admin/sponsors/page.tsx  (Server Component)
export default async function AdminSponsors() {
  const { conference, error } = await getConferenceForCurrentDomain({})
  if (error) return <ErrorDisplay title="Error" message={error.message} />

  const data = await fetchSponsors(conference._id)
  return <SponsorsPageClient data={data} conference={conference} />
}

// loading.tsx  (Next.js loading boundary)
import { AdminTablePageLoading } from '@/components/admin'

export default function Loading() {
  return <AdminTablePageLoading />
}`}
          </pre>
        </section>

        {/* AdminPageHeader */}
        <section className="mb-12">
          <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            AdminPageHeader
          </h2>
          <p className="font-inter mb-4 text-sm text-gray-600 dark:text-gray-400">
            Every admin page must use AdminPageHeader for the title area. It
            provides consistent spacing, icon placement, stat cards, and
            responsive action buttons.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
            {`import { AdminPageHeader } from '@/components/admin'
import { ChartBarIcon } from '@heroicons/react/24/outline'

<AdminPageHeader
  icon={<ChartBarIcon className="h-full w-full" />}
  title="Page Title"
  description="Brief description of this page"
  contextHighlight={conference.title}  // Optional highlight
  backLink={{ href: '/admin', label: 'Back' }}  // Detail pages
  stats={[
    { value: 42, label: 'Total', color: 'blue' },
    { value: 8, label: 'Pending', color: 'yellow' },
  ]}
  actionItems={[                // Preferred over raw actions
    { label: 'Create', icon: <PlusIcon />, onClick: fn },
    { label: 'Export', onClick: fn, variant: 'secondary' },
  ]}
/>`}
          </pre>
        </section>

        {/* Error Handling */}
        <section className="mb-12">
          <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Error Handling
          </h2>
          <p className="font-inter mb-4 text-sm text-gray-600 dark:text-gray-400">
            Use a three-tier error strategy:
          </p>
          <div className="space-y-3">
            {[
              {
                title: '1. Conference loading errors',
                desc: 'Return <ErrorDisplay> immediately in the server component.',
              },
              {
                title: '2. Data loading errors',
                desc: 'Return <ErrorDisplay> with a contextual back link.',
              },
              {
                title: '3. Runtime errors',
                desc: 'Use useNotification() for toast feedback on action failures.',
              },
            ].map(({ title, desc }) => (
              <div
                key={title}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Notifications */}
        <section className="mb-12">
          <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Notifications
          </h2>
          <p className="font-inter mb-4 text-sm text-gray-600 dark:text-gray-400">
            AdminLayout wraps everything in NotificationProvider. Use the hook
            for toast messages on user actions.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
            {`import { useNotification } from '@/components/admin'

const { showNotification } = useNotification()

// After a successful action
showNotification({
  type: 'success',
  title: 'Sponsor Updated',
  message: 'The sponsor details have been saved.',
})

// After an error
showNotification({
  type: 'error',
  title: 'Failed to Save',
  message: error.message,
})`}
          </pre>
        </section>

        {/* Data Operations */}
        <section className="mb-12">
          <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Data Operations
          </h2>
          <p className="font-inter mb-4 text-sm text-gray-600 dark:text-gray-400">
            Use tRPC for all admin CRUD operations. It provides type safety,
            automatic cache invalidation, and optimistic updates via React
            Query.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
            {`import { trpc } from '@/lib/trpc/client'

// Query
const { data, isLoading } = trpc.sponsors.list.useQuery({
  conferenceId: conference._id,
})

// Mutation with cache invalidation
const utils = trpc.useUtils()
const { mutateAsync } = trpc.sponsors.update.useMutation({
  onSuccess: () => {
    utils.sponsors.list.invalidate()
    showNotification({ type: 'success', title: 'Updated!' })
  },
})`}
          </pre>
        </section>

        {/* Confirmations */}
        <section className="mb-12">
          <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Destructive Actions
          </h2>
          <p className="font-inter mb-4 text-sm text-gray-600 dark:text-gray-400">
            Always use ConfirmationModal before destructive operations. Use the
            danger variant for delete actions.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
            {`import { ConfirmationModal } from '@/components/admin'

<ConfirmationModal
  isOpen={showDelete}
  onClose={() => setShowDelete(false)}
  onConfirm={handleDelete}
  title="Remove Sponsor"
  message="This will remove the sponsor and all associated data."
  confirmButtonText="Remove"
  variant="danger"
  isLoading={isPending}
/>`}
          </pre>
        </section>

        {/* Checklist */}
        <section>
          <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Checklist
          </h2>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {[
                'Use AdminPageHeader for every page header',
                'Add loading.tsx with appropriate skeleton',
                'Handle errors with ErrorDisplay in server components',
                'Use NotificationProvider toasts for action feedback',
                'Use tRPC for data operations',
                'Confirm destructive actions with ConfirmationModal',
                'Support dark mode with Tailwind dark: variants',
                'Use responsive breakpoints (mobile → desktop)',
                'Use AdminHeaderActions for page-level buttons',
                'Keep server components for auth guards and data fetching',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-500">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  ),
}

/**
 * Dashboard page with Stats components showing multiple metric displays.
 * Uses MetricCard for top-level KPIs and StatCard for breakdowns.
 */
export const DashboardWithStats: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<ChartBarIcon className="h-full w-full" />}
          title="Conference Dashboard"
          description="Overview for"
          contextHighlight="Cloud Native Days Norway 2026"
        />

        {/* Top-level metrics using MetricCard */}
        <div className="mt-6">
          <h2 className="mb-4 text-sm font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Key Metrics
          </h2>
          <StatsGrid columns={4}>
            <MetricCard
              title="Total Revenue"
              value="kr 450,000"
              subtitle="kr 380,000 collected"
              icon={CurrencyDollarIcon}
              trend="up"
            />
            <MetricCard
              title="Ticket Sales"
              value="324 / 500"
              subtitle="65% capacity"
              icon={TicketIcon}
              trend="up"
            />
            <MetricCard
              title="Sponsors"
              value={12}
              subtitle="5 in pipeline"
              icon={CheckCircleIcon}
              trend="neutral"
            />
            <MetricCard
              title="Days Until Event"
              value={45}
              subtitle="March 28, 2026"
              icon={ClockIcon}
              trend="neutral"
            />
          </StatsGrid>
        </div>

        {/* Breakdowns using StatCard */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Proposal Status
            </h3>
            <StatsGrid columns={4} gap="sm">
              <StatCard value={156} label="Total" color="slate" />
              <StatCard value={42} label="Under Review" color="yellow" />
              <StatCard value={38} label="Accepted" color="green" />
              <StatCard value={24} label="Rejected" color="red" />
            </StatsGrid>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Ticket Breakdown
            </h3>
            <StatsGrid columns={4} gap="sm">
              <StatCard value={200} label="Early Bird" color="green" />
              <StatCard value={80} label="Regular" color="blue" />
              <StatCard value={24} label="Speaker" color="purple" />
              <StatCard value={20} label="Sponsor" color="indigo" />
            </StatsGrid>
          </div>
        </div>

        {/* Quick navigation */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Quick Navigation
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Proposals', count: 156, href: '/admin/proposals' },
              { label: 'Speakers', count: 48, href: '/admin/speakers' },
              { label: 'Sponsors', count: 12, href: '/admin/sponsors' },
              { label: 'Tickets', count: 324, href: '/admin/tickets' },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
              >
                <span className="font-medium text-gray-900 dark:text-white">
                  {item.label}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {item.count}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  ),
}
