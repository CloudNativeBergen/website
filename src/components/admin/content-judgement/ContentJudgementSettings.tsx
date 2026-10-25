'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { formatDateTimeSafe } from '@/lib/time'
import { useNotification } from '@/components/admin/NotificationProvider'

export interface ContentJudgementSettingsProps {
  enabled: boolean
  /** ISO time of the last change, absent when never changed. */
  changedAt?: string
  /** Who made the last change; `null` once that organizer is erased. */
  changedByName?: string | null
}

/**
 * The body of the Content judgement card on /admin/settings (Content
 * judgement spec §5): the Judge content switch, and who last changed it and
 * when. Writes `organization.updateContentJudgement`; the server decides who
 * may. Optimistic, rolled back on error, like `PublicFreeTicketToggle`. The
 * Enforce switches join in J7.
 */
export function ContentJudgementSettings({
  enabled: initialEnabled,
  changedAt,
  changedByName,
}: ContentJudgementSettingsProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [enabled, setEnabled] = useState(initialEnabled)

  const mutation = api.organization.updateContentJudgement.useMutation({
    onSuccess: (_data, variables) => {
      router.refresh()
      showNotification({
        type: 'success',
        title: variables.enabled
          ? 'Content judgement on'
          : 'Content judgement off',
        message: variables.enabled
          ? 'New content is checked for every edition run by this organization.'
          : 'No new content is sent for checking.',
      })
    },
    onError: (error, variables) => {
      setEnabled(!variables.enabled)
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to update content judgement.',
      })
    },
  })

  const toggle = () => {
    if (mutation.isPending) return
    const next = !enabled
    setEnabled(next)
    mutation.mutate({ enabled: next })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            id="judge-content-label"
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            Judge content
          </p>
          <p
            id="judge-content-help"
            className="mt-1 text-sm text-gray-500 dark:text-gray-400"
          >
            TypeSafe&apos;s Jev classifier checks Wall Posts, comments on
            session feedback and the first message of each conversation, and
            gives organizers advice. A person still decides.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="judge-content-label"
          aria-describedby="judge-content-help"
          disabled={mutation.isPending}
          onClick={toggle}
          // 44×24 to the eye; the `after` box makes the touch target 44×44
          // (see PublicFreeTicketToggle for the inset arithmetic).
          className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out after:absolute after:-inset-x-0.5 after:-inset-y-3 after:content-[''] focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-gray-900 ${
            enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Content is sent through OpenRouter to TypeSafe in the United States,
        with zero data retention. Your privacy page lists OpenRouter while this
        is on, and for as long as any result is still stored.
      </p>

      <p className="border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {changedAt ? (
          <>
            {initialEnabled ? 'Turned on' : 'Turned off'} by{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {changedByName ?? 'a former organizer'}
            </span>{' '}
            on {formatDateTimeSafe(changedAt)}
          </>
        ) : (
          'Off by default. No organizer has turned it on yet.'
        )}
      </p>
    </div>
  )
}
