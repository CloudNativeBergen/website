'use client'

import { useId } from 'react'
import { CalendarDaysIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { formatDateSafe, instantToOsloLocalInput } from '@/lib/time'
import {
  followUpDateToIso,
  followUpInDays,
  isFollowUpOverdue,
} from '@/lib/sponsor-crm/follow-up'
import { MAX_REMINDERS } from '@/lib/sponsor-crm/contract-send-state'

interface SponsorFollowUpWidgetProps {
  sponsorId: string
  initialData?: {
    nextFollowUpAt?: string | null
    contactInitiatedAt?: string | null
    outreachCount?: number | null
    reminderCount?: number | null
  }
  onChanged: () => void
}

const QUICK_PICKS = [
  { label: 'In 3 days', days: 3 },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
]

const buttonClass =
  'min-h-10 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-xs sm:min-h-0 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600'

export function SponsorFollowUpWidget({
  sponsorId,
  initialData,
  onChanged,
}: SponsorFollowUpWidgetProps) {
  const dateInputId = useId()
  const { showNotification } = useNotification()
  const { data } = api.sponsor.crm.getOverview.useQuery(
    { id: sponsorId },
    { initialData },
  )
  const update = api.sponsor.crm.update.useMutation({
    onSuccess: onChanged,
    onError: (error) =>
      showNotification({
        type: 'error',
        title: 'Could not save the follow-up date',
        message: error.message,
      }),
  })

  const nextFollowUpAt: string | null | undefined = data?.nextFollowUpAt
  const overdue = isFollowUpOverdue(nextFollowUpAt)
  const save = (value: string | null) =>
    update.mutate({ id: sponsorId, nextFollowUpAt: value })

  return (
    <div
      id="follow-up"
      className="scroll-mt-4 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <CalendarDaysIcon className="h-5 w-5 text-gray-500" />
        <h2 className="text-base leading-7 font-semibold text-gray-900 dark:text-white">
          Follow-up
        </h2>
      </div>

      <div className="space-y-4 p-6">
        <p
          className={
            overdue
              ? 'text-sm font-medium text-red-600 dark:text-red-400'
              : 'text-sm text-gray-900 dark:text-white'
          }
        >
          {nextFollowUpAt ? (
            <>
              Next follow-up: {formatDateSafe(nextFollowUpAt)}
              {overdue && ' (overdue)'}
            </>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">
              No follow-up set
            </span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {QUICK_PICKS.map(({ label, days }) => (
            <button
              key={days}
              type="button"
              className={buttonClass}
              disabled={update.isPending}
              onClick={() => save(followUpInDays(days))}
            >
              {label}
            </button>
          ))}
          {nextFollowUpAt && (
            <button
              type="button"
              className={buttonClass}
              disabled={update.isPending}
              onClick={() => save(null)}
            >
              Clear
            </button>
          )}
        </div>

        <div>
          <label
            htmlFor={dateInputId}
            className="block text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            Follow-up date
          </label>
          <input
            id={dateInputId}
            type="date"
            className="mt-1 rounded-md border-0 px-2 py-1.5 text-sm text-gray-900 ring-1 ring-gray-300 ring-inset dark:bg-gray-700 dark:text-white dark:ring-gray-600"
            value={instantToOsloLocalInput(nextFollowUpAt ?? '').slice(0, 10)}
            disabled={update.isPending}
            // An empty value is a half-typed date, not a clear: Clear does that.
            onChange={(e) =>
              e.target.value && save(followUpDateToIso(e.target.value))
            }
          />
        </div>

        <dl className="grid grid-cols-3 gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
              First contact
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">
              {data?.contactInitiatedAt ? (
                formatDateSafe(data.contactInitiatedAt)
              ) : (
                <span className="text-gray-400">Not yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Emails sent
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">
              {data?.outreachCount ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Contract reminders
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">
              {data?.reminderCount ?? 0} of {MAX_REMINDERS}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
