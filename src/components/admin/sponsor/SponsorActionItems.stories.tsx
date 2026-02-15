import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  ExclamationTriangleIcon,
  FireIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const meta = {
  title: 'Systems/Sponsors/Admin/Dashboard/Action Items',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type Severity = 'critical' | 'warning' | 'info'

interface ActionItem {
  id: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  title: string
  description: string
  severity: Severity
  link: string
}

const severityBorder: Record<Severity, string> = {
  critical: 'border-l-red-500 dark:border-l-red-400',
  warning: 'border-l-amber-500 dark:border-l-amber-400',
  info: 'border-l-blue-400 dark:border-l-blue-500',
}

const severityBg: Record<Severity, string> = {
  critical: 'bg-red-50/60 dark:bg-red-950/20',
  warning: '',
  info: '',
}

const severityHeaderColor: Record<Severity, string> = {
  critical: 'text-red-700 dark:text-red-400',
  warning: 'text-amber-700 dark:text-amber-400',
  info: 'text-blue-600 dark:text-blue-400',
}

const severityLabel: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Needs Attention',
  info: 'Informational',
}

const mockItems: ActionItem[] = [
  {
    id: '1',
    icon: ExclamationTriangleIcon,
    iconColor: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20',
    title: 'Invoice Overdue',
    description: 'Invoice is overdue for DataSys',
    severity: 'critical',
    link: '#',
  },
  {
    id: '2',
    icon: FireIcon,
    iconColor: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20',
    title: 'Urgent Prospect',
    description: 'Microsoft is a high-priority prospect not yet contacted',
    severity: 'critical',
    link: '#',
  },
  {
    id: '3',
    icon: DocumentTextIcon,
    iconColor:
      'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20',
    title: 'Invoice Not Sent',
    description: 'Invoice not yet sent to Acme Corp',
    severity: 'critical',
    link: '#',
  },
  {
    id: '4',
    icon: DocumentTextIcon,
    iconColor:
      'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/20',
    title: 'Contract In Progress',
    description: 'Contract status: verbal agreement for KS Digital',
    severity: 'warning',
    link: '#',
  },
  {
    id: '5',
    icon: PaperAirplaneIcon,
    iconColor:
      'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20',
    title: 'Registration Pending',
    description: 'Scale AQ has not completed registration',
    severity: 'info',
    link: '#',
  },
]

function ActionRow({ item }: { item: ActionItem }) {
  const Icon = item.icon
  return (
    <div
      className={clsx(
        'flex cursor-pointer items-center gap-3 border-l-4 px-3 py-2.5 transition-colors',
        'hover:bg-gray-100/80 dark:hover:bg-gray-700/40',
        severityBorder[item.severity],
        severityBg[item.severity],
      )}
    >
      <div
        className={clsx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          item.iconColor,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {item.title}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {item.description}
        </p>
      </div>
    </div>
  )
}

function ActionItemsWidget({
  items,
  subtitle,
}: {
  items: ActionItem[]
  subtitle?: string
}) {
  const grouped: Record<Severity, ActionItem[]> = {
    critical: [],
    warning: [],
    info: [],
  }
  for (const item of items) {
    grouped[item.severity].push(item)
  }
  const criticalCount = grouped.critical.length

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3 px-6 pt-5 pb-3">
        {criticalCount > 0 && (
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 dark:text-red-400" />
        )}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Action Items
        </h3>
        {items.length > 0 && (
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-xs font-bold',
              criticalCount > 0
                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
            )}
          >
            {items.length}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {subtitle ?? 'All tasks'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="px-6 pb-6">
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center dark:border-gray-600">
            <CheckCircleIcon className="mx-auto h-12 w-12 text-green-400 dark:text-green-500" />
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              All caught up!
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No urgent action items at the moment.
            </p>
          </div>
        </div>
      ) : (
        <div className="pb-1">
          {(['critical', 'warning', 'info'] as Severity[]).map((severity) => {
            const group = grouped[severity]
            if (group.length === 0) return null
            return (
              <div key={severity}>
                <div className="px-6 pt-2 pb-1">
                  <span
                    className={clsx(
                      'text-[11px] font-semibold tracking-wider uppercase',
                      severityHeaderColor[severity],
                    )}
                  >
                    {severityLabel[severity]}
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {group.map((item) => (
                    <ActionRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="border-t border-gray-200 px-6 py-3 dark:border-gray-700">
          <span className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
            View all in CRM →
          </span>
        </div>
      )}
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="max-w-lg">
      <ActionItemsWidget items={mockItems} />
    </div>
  ),
}

export const CriticalOnly: Story = {
  render: () => (
    <div className="max-w-lg">
      <ActionItemsWidget
        items={mockItems.filter((i) => i.severity === 'critical')}
      />
    </div>
  ),
}

export const NoUrgent: Story = {
  render: () => (
    <div className="max-w-lg">
      <ActionItemsWidget
        items={mockItems.filter((i) => i.severity !== 'critical')}
      />
    </div>
  ),
}

export const Empty: Story = {
  render: () => (
    <div className="max-w-lg">
      <ActionItemsWidget items={[]} />
    </div>
  ),
}

export const WithOrganizerFilter: Story = {
  render: () => (
    <div className="max-w-lg">
      <ActionItemsWidget items={mockItems.slice(0, 3)} subtitle="Your tasks" />
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorActionItems
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Displays a prioritized, severity-grouped list of pending tasks for
          sponsor management. Items are grouped into Critical, Needs Attention,
          and Informational sections with colored left borders for quick
          scanning.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conferenceId
            </code>{' '}
            - Conference to fetch actions for
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              organizerId?
            </code>{' '}
            - Filter to show only assigned items
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Severity Levels
        </h3>
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                Critical (priority 1&ndash;2.5)
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Overdue invoices, urgent prospects, signature rejected, invoices
                not sent, send contract
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Needs Attention (priority 3&ndash;4)
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Missing contract, contract in progress, signature expired
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-blue-400" />
            <div>
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Informational (priority 4.5+)
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Follow-up needed, stale negotiations, registration pending
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}
