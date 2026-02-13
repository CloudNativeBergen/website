import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  ExclamationTriangleIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Dashboard/Action Items',
  parameters: {
    layout: 'padded',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface ActionItem {
  id: string
  type: 'follow_up' | 'contract' | 'onboarding' | 'invoice'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  dueDate?: string
}

const mockActionItems: ActionItem[] = [
  {
    id: '1',
    type: 'follow_up',
    title: 'Follow up with Acme Corp',
    description: 'Last contact was 7 days ago, no response yet',
    priority: 'high',
    dueDate: 'Today',
  },
  {
    id: '2',
    type: 'contract',
    title: 'Send contract to TechStart',
    description: 'Verbal agreement reached, awaiting contract',
    priority: 'high',
    dueDate: 'Today',
  },
  {
    id: '3',
    type: 'onboarding',
    title: 'Complete onboarding for CloudCo',
    description: 'Missing logo and billing info',
    priority: 'medium',
    dueDate: 'This week',
  },
  {
    id: '4',
    type: 'invoice',
    title: 'Invoice overdue: DataSys',
    description: 'Invoice sent 30 days ago, payment pending',
    priority: 'high',
    dueDate: 'Overdue',
  },
]

function getActionIcon(type: ActionItem['type']) {
  switch (type) {
    case 'follow_up':
      return EnvelopeIcon
    case 'contract':
      return DocumentTextIcon
    case 'onboarding':
      return ClockIcon
    case 'invoice':
      return ExclamationTriangleIcon
    default:
      return ClockIcon
  }
}

function getActionColor(type: ActionItem['type']) {
  switch (type) {
    case 'follow_up':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
    case 'contract':
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
    case 'onboarding':
      return 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
    case 'invoice':
      return 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
  }
}

function getPriorityBadge(priority: ActionItem['priority']) {
  switch (priority) {
    case 'high':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'medium':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'low':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

export const Default: Story = {
  render: () => (
    <div className="max-w-lg">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Action Items
          </h3>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {mockActionItems.length} pending
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {mockActionItems.map((item) => {
            const Icon = getActionIcon(item.type)
            return (
              <div
                key={item.id}
                className="cursor-pointer rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`rounded-lg p-2 ${getActionColor(item.type)}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {item.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityBadge(item.priority)}`}
                      >
                        {item.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {item.description}
                    </p>
                    {item.dueDate && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                        Due: {item.dueDate}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  ),
}

export const Empty: Story = {
  render: () => (
    <div className="max-w-lg">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Action Items
        </h3>
        <div className="mt-4 rounded-lg border-2 border-dashed border-gray-300 p-6 text-center dark:border-gray-600">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            All caught up!
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            No urgent action items at the moment.
          </p>
        </div>
      </div>
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
          Displays a prioritized list of pending tasks for sponsor management.
          Uses tRPC to fetch action items generated from sponsor pipeline data.
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
          Action Types
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <div className="rounded bg-blue-100 p-1.5 dark:bg-blue-900/20">
              <EnvelopeIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              follow_up - Contact follow-ups
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded bg-purple-100 p-1.5 dark:bg-purple-900/20">
              <DocumentTextIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              contract - Contract actions
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded bg-amber-100 p-1.5 dark:bg-amber-900/20">
              <ClockIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              onboarding - Pending onboarding
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded bg-red-100 p-1.5 dark:bg-red-900/20">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              invoice - Payment issues
            </span>
          </div>
        </div>
      </div>
    </div>
  ),
}
