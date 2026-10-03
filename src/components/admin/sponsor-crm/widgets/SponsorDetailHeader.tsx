/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { api } from '@/lib/trpc/client'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import { STATUSES } from '@/components/admin/sponsor-crm/form/constants'

interface SponsorDetailHeaderProps {
  onMessage?: () => void
  initialData?: any
  sponsorId: string
  conferenceId: string
}

export function SponsorDetailHeader({
  sponsorId,
  conferenceId,
  onMessage,
  initialData,
}: SponsorDetailHeaderProps) {
  const router = useRouter()
  const trpcUtils = api.useUtils()

  const { data, isLoading } = api.sponsor.crm.getOverview.useQuery(
    {
      id: sponsorId,
    },
    { initialData },
  )

  const updateMutation = api.sponsor.crm.update.useMutation({
    onSuccess: () => {
      trpcUtils.sponsor.crm.getOverview.invalidate({ id: sponsorId })
      trpcUtils.sponsor.crm.list.invalidate() // Invalidate the Kanban board too
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-20 animate-pulse items-center justify-between border-b border-gray-200 bg-white px-8 dark:border-gray-800 dark:bg-gray-900">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-8 w-24 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex flex-col border-b border-gray-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        {data.sponsor?.logo ? (
          <img
            src={data.sponsor.logo}
            alt={data.sponsor.name}
            className="h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain p-1"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xl font-bold text-gray-400 dark:border-gray-700 dark:bg-gray-800">
            {data.sponsor?.name?.charAt(0) || '?'}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.sponsor?.name || 'Unknown Sponsor'}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <select
              value={data.status}
              disabled={updateMutation.isPending}
              onChange={(e) => {
                updateMutation.mutate({
                  id: sponsorId,
                  status: e.target.value as any,
                })
              }}
              className="inline-flex items-center rounded-md bg-blue-50 py-1 pr-8 pl-2 text-xs font-medium text-blue-700 ring-1 ring-blue-700/10 ring-inset focus:ring-2 focus:ring-blue-500 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-400/20"
            >
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <span>&bull;</span>
            <span>{data.tier?.title || 'No Tier'}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-3 sm:mt-0">
        {data.status !== 'closed-won' && (
          <button
            onClick={() =>
              updateMutation.mutate({ id: sponsorId, status: 'closed-won' })
            }
            disabled={updateMutation.isPending}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Mark as Won
          </button>
        )}
        <button className="inline-flex items-center justify-center rounded-md border border-transparent bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none">
          Send Email
        </button>
      </div>
    </div>
  )
}
