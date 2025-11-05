'use client'

import { useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import Link from 'next/link'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import {
  getActionItemIcon,
  getActionItemColor,
} from '@/components/admin/sponsor-crm/utils'
import { generateActionItems } from '@/lib/sponsor-crm/action-items'

interface SponsorActionItemsProps {
  conferenceId: string
  organizerId?: string
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

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Action Items
        </h3>
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Action Items
        </h3>
        {organizerId && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Your tasks
          </span>
        )}
      </div>

      {actionItems.length === 0 ? (
        <div className="mt-4 rounded-lg border-2 border-dashed border-gray-300 p-6 text-center dark:border-gray-600">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            All caught up!
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            No urgent action items at the moment.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {actionItems.map((item) => {
            const Icon = getActionItemIcon(item.type)
            return (
              <Link
                key={item.id}
                href={item.link}
                className="block rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={clsx(
                      'rounded-full p-2',
                      getActionItemColor(item.type),
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {actionItems.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Link
            href={`/admin/sponsors/crm${organizerId ? `?assigned_to=${organizerId}` : ''}`}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            View all in CRM →
          </Link>
        </div>
      )}
    </div>
  )
}
