'use client'

import React, { useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import Link from 'next/link'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import {
  getActionItemIcon,
  getActionItemColor,
} from '@/components/admin/sponsor-crm/utils'
import {
  generateActionItems,
  type ActionItem,
} from '@/lib/sponsor-crm/action-items'

type Severity = 'critical' | 'warning' | 'info'

function getSeverity(priority: number): Severity {
  if (priority <= 2.5) return 'critical'
  if (priority <= 4) return 'warning'
  return 'info'
}

function getSeverityLabel(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'Critical'
    case 'warning':
      return 'Needs Attention'
    case 'info':
      return 'Informational'
  }
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

interface SponsorActionItemsProps {
  conferenceId: string
  organizerId?: string
}

function ActionRowIcon({ type }: { type: ActionItem['type'] }) {
  return React.createElement(getActionItemIcon(type), { className: 'h-4 w-4' })
}

function ActionRow({ item }: { item: ActionItem }) {
  const severity = getSeverity(item.priority)

  return (
    <Link
      href={item.link}
      className={clsx(
        'flex items-center gap-3 border-l-4 px-3 py-2.5 transition-colors',
        'hover:bg-gray-100/80 dark:hover:bg-gray-700/40',
        severityBorder[severity],
        severityBg[severity],
      )}
    >
      <div
        className={clsx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          getActionItemColor(item.type),
        )}
      >
        <ActionRowIcon type={item.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {item.title}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {item.description}
        </p>
      </div>
    </Link>
  )
}

export function SponsorActionItems({
  conferenceId,
  organizerId,
}: SponsorActionItemsProps) {
  const { data: sponsors = [], isLoading } = api.sponsor.crm.list.useQuery({
    conferenceId,
  })

  const actionItems = useMemo(() => {
    if (!sponsors.length) return []
    return generateActionItems(sponsors, organizerId)
  }, [sponsors, organizerId])

  const grouped = useMemo(() => {
    const groups: Record<Severity, ActionItem[]> = {
      critical: [],
      warning: [],
      info: [],
    }
    for (const item of actionItems) {
      groups[getSeverity(item.priority)].push(item)
    }
    return groups
  }, [actionItems])

  const criticalCount = grouped.critical.length

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Action Items
        </h3>
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded bg-gray-100 dark:bg-gray-700"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3 px-6 pt-5 pb-3">
        {criticalCount > 0 && (
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 dark:text-red-400" />
        )}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Action Items
        </h3>
        {actionItems.length > 0 && (
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-xs font-bold',
              criticalCount > 0
                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
            )}
          >
            {actionItems.length}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {organizerId ? 'Your tasks' : 'All tasks'}
        </span>
      </div>

      {actionItems.length === 0 ? (
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
            const items = grouped[severity]
            if (items.length === 0) return null
            return (
              <div key={severity}>
                <div className="px-6 pt-2 pb-1">
                  <span
                    className={clsx(
                      'text-[11px] font-semibold tracking-wider uppercase',
                      severityHeaderColor[severity],
                    )}
                  >
                    {getSeverityLabel(severity)}
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {items.map((item) => (
                    <ActionRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {actionItems.length > 0 && (
        <div className="border-t border-gray-200 px-6 py-3 dark:border-gray-700">
          <Link
            href={`/admin/sponsors/crm${organizerId ? `?assignedTo=${organizerId}` : ''}`}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            View all in CRM →
          </Link>
        </div>
      )}
    </div>
  )
}
