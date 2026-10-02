'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import type { CommunicationKind } from '@/lib/sponsor-crm/types'
import {
  COMMUNICATION_KINDS,
  COMMUNICATION_KIND_LABELS,
} from '@/lib/sponsor-crm/communication'
import { SponsorCommunicationLine } from '../sponsor/SponsorCommunicationLine'

const PAGE_SIZE = 20
const MAX_LIMIT = 100

/**
 * The Communications tab (#1261): only what has been SENT to this sponsor,
 * newest first, filterable by kind — no notes or status changes in the way.
 * "Load more" widens the same query, so the filter and the page agree.
 */
export function SponsorCommunicationsPanel({
  sponsorForConferenceId,
  onSend,
}: {
  sponsorForConferenceId: string
  /** Opens the Send modal; omitted when the host cannot supply the sender. */
  onSend?: () => void
}) {
  const [kind, setKind] = useState<CommunicationKind | undefined>(undefined)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data, isLoading, isFetching } =
    api.sponsor.crm.activities.listCommunications.useQuery({
      sponsorForConferenceId,
      kind,
      offset: 0,
      limit,
    })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const canLoadMore = items.length < total && limit < MAX_LIMIT

  const pickKind = (next: CommunicationKind | undefined) => {
    setKind(next)
    setLimit(PAGE_SIZE)
  }

  return (
    <div className="space-y-4 py-2" data-testid="communications-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Filter by kind"
          className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
        >
          {[undefined, ...COMMUNICATION_KINDS].map((k) => {
            const active = k === kind
            return (
              <button
                key={k ?? 'all'}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => pickKind(k)}
                className={clsx(
                  'font-inter cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-white text-gray-900 shadow-xs dark:bg-gray-700 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white',
                )}
              >
                {k ? COMMUNICATION_KIND_LABELS[k] : 'All'}
              </button>
            )
          })}
        </div>
        {!isLoading && (
          <span className="font-inter text-xs text-gray-500 dark:text-gray-400">
            {total === 1 ? '1 email' : `${total} emails`}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <PaperAirplaneIcon className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500" />
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {kind
              ? `No ${COMMUNICATION_KIND_LABELS[kind].toLowerCase()} emails sent yet`
              : 'Nothing sent yet'}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Every email sent to this sponsor is recorded here, with who received
            it and exactly what it said.
          </p>
          {onSend && (
            <button
              type="button"
              onClick={onSend}
              className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-brand-cloud-blue px-3 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-primary-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
              Send an email
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {items.map((activity) => (
            <SponsorCommunicationLine key={activity._id} activity={activity} />
          ))}
        </div>
      )}

      {canLoadMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((l) => Math.min(MAX_LIMIT, l + PAGE_SIZE))}
            disabled={isFetching}
            className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {isFetching
              ? 'Loading…'
              : `Load more (${total - items.length} left)`}
          </button>
        </div>
      )}
      {!canLoadMore && items.length < total && (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Showing the {MAX_LIMIT} most recent of {total}.
        </p>
      )}
    </div>
  )
}
