/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { api } from '@/lib/trpc/client'
import {
  BuildingOffice2Icon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

interface SponsorOverviewWidgetProps {
  sponsorId: string
  initialData?: any
  onEdit: () => void
}

export function SponsorOverviewWidget({
  sponsorId,
  onEdit,
  initialData,
}: SponsorOverviewWidgetProps) {
  const { data, isLoading, error } = api.sponsor.crm.getOverview.useQuery(
    {
      id: sponsorId,
    },
    { initialData },
  )

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 h-6 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mb-2 h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load sponsor overview.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <BuildingOffice2Icon className="h-5 w-5 text-gray-500" />
          <h2 className="text-base leading-7 font-semibold text-gray-900 dark:text-white">
            Overview
          </h2>
        </div>
        <button
          onClick={onEdit}
          className="text-sm font-medium text-brand-cloud-blue hover:text-indigo-500 dark:text-indigo-400"
        >
          Manage
        </button>
      </div>

      <div className="p-6">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Deal Status
            </dt>
            <dd className="mt-1 text-sm text-gray-900 capitalize dark:text-white">
              {data.status.replace('-', ' ')}
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Assigned To
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">
              {data.assignedTo?.name || (
                <span className="text-gray-400">Unassigned</span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Tier
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">
              {data.tier?.title || <span className="text-gray-400">None</span>}
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Contract Value
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">
              {data.contractValue ? (
                `${data.contractValue} ${data.contractCurrency}`
              ) : (
                <span className="text-gray-400">Not set</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
