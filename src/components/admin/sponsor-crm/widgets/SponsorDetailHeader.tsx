/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { api } from '@/lib/trpc/client'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import clsx from 'clsx'
import { SponsorLogo } from '@/components/SponsorLogo'
import { STATUSES } from '@/components/admin/sponsor-crm/form/constants'

interface SponsorDetailHeaderProps {
  initialData?: any
  sponsorId: string
  /** Opens the full sponsor record (every tab of the former modal). */
  onOpenRecord: () => void
  /** Opens the Send modal. Omitted when there is no sender identity. */
  onSendEmail?: () => void
  /** Back arrow target. Defaults to the pipeline board. */
  backHref?: string
}

export function SponsorDetailHeader({
  sponsorId,
  initialData,
  onOpenRecord,
  onSendEmail,
  backHref = '/admin/sponsors/crm',
}: SponsorDetailHeaderProps) {
  const { data, isLoading } = api.sponsor.crm.getOverview.useQuery(
    {
      id: sponsorId,
    },
    { initialData },
  )

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
    <div className="flex flex-col border-b border-gray-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 lg:px-8 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Link
          href={backHref}
          aria-label="Back to the sponsor pipeline"
          className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        {data.sponsor?.logo ? (
          <div className="h-12 w-12 shrink-0 overflow-hidden">
            <SponsorLogo
              logo={data.sponsor.logo}
              logoBright={data.sponsor.logoBright}
              name={data.sponsor.name}
              // Dark mode shows logoBright, which needs a dark tile; without
              // one the regular logo keeps its white tile for contrast.
              className={clsx(
                'h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain p-1 dark:border-gray-700',
                data.sponsor.logoBright && 'dark:bg-gray-800',
              )}
            />
          </div>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xl font-bold text-gray-400 dark:border-gray-700 dark:bg-gray-800">
            {data.sponsor?.name?.charAt(0) || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">
            {data.sponsor?.name || 'Unknown Sponsor'}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {/* Read-only: stages change on the board, through the phase
                card's next action, or in the record panel. */}
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-700/10 ring-inset dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-400/20">
              {STATUSES.find((s) => s.value === data.status)?.label ??
                data.status}
            </span>
            <span>&bull;</span>
            <span>{data.tier?.title || 'No Tier'}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex shrink-0 flex-wrap gap-3 sm:mt-0">
        <button
          onClick={onOpenRecord}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Open record
        </button>
        {onSendEmail && (
          <button
            onClick={onSendEmail}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            Send Email
          </button>
        )}
      </div>
    </div>
  )
}
