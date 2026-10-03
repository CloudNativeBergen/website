/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'

interface SponsorActivityFeedWidgetProps {
  sponsorId: string
  onNewActivity: () => void
}

export function SponsorActivityFeedWidget({
  sponsorId,
  onNewActivity,
}: SponsorActivityFeedWidgetProps) {
  const trpcUtils = api.useUtils()
  const [note, setNote] = useState('')

  const { data, isLoading, error } = api.sponsor.crm.activities.list.useQuery({
    sponsorForConferenceId: sponsorId,
  })

  const createActivity = api.sponsor.crm.activities.create.useMutation({
    onSuccess: () => {
      setNote('')
      trpcUtils.sponsor.crm.activities.list.invalidate({
        sponsorForConferenceId: sponsorId,
      })
    },
  })

  const handleSaveNote = () => {
    if (!note.trim()) return
    createActivity.mutate({
      sponsorForConferenceId: sponsorId,
      activityType: 'note',
      description: note.trim(),
    })
  }

  if (isLoading) {
    return (
      <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load activity feed.
        </p>
      </div>
    )
  }

  const items = data || []

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="h-5 w-5 text-gray-500" />
          <h2 className="text-base leading-7 font-semibold text-gray-900 dark:text-white">
            Activity Feed
          </h2>
        </div>
      </div>

      <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Log a call, meeting, or note..."
          className="block w-full resize-none rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset sm:text-sm sm:leading-6 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleSaveNote}
            disabled={!note.trim() || createActivity.isPending}
            className="inline-flex items-center rounded-md bg-brand-cloud-blue px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
          >
            {createActivity.isPending ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            No activity recorded yet.
          </p>
        ) : (
          <div className="flow-root">
            <ul role="list" className="-mb-8">
              {items.map((activity, idx) => (
                <li key={activity._id}>
                  <div className="relative pb-8">
                    {idx !== items.length - 1 ? (
                      <span
                        className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="relative flex items-start space-x-3">
                      <div className="relative">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 ring-8 ring-white dark:bg-gray-800 dark:ring-gray-800">
                          {activity.activityType === 'email' ? (
                            <EnvelopeIcon
                              className="h-5 w-5 text-gray-500"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChatBubbleLeftRightIcon
                              className="h-5 w-5 text-gray-500"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 py-1.5">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          <span className="mr-2 font-medium text-gray-900 dark:text-gray-100">
                            {activity.createdBy?.name || 'System'}
                          </span>
                          {activity.activityType === 'email'
                            ? 'sent an email'
                            : 'added a note'}
                          <span className="ml-2 whitespace-nowrap">
                            {new Date(activity._createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                          {activity.description}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
