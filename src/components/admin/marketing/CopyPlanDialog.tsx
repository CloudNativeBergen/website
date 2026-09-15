'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'

/**
 * "Copy a previous edition's plan" (spec §3.1, #1017): pick one of the
 * organization's other editions with a plan, then copy it onto this
 * edition's Milestones.
 */
export function CopyPlanDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const sources = api.marketing.plan.copySources.useQuery(undefined, {
    enabled: isOpen,
  })
  const [picked, setPicked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selected = picked ?? sources.data?.[0]?.planId ?? null

  const copy = api.marketing.plan.copy.useMutation({
    onSuccess: (result) => {
      void utils.marketing.plan.get.invalidate()
      showNotification({
        type: 'success',
        title: 'Marketing plan copied',
        message: `${result.campaigns} campaigns, ${result.tasks} tasks.`,
      })
      close()
    },
    onError: (err) => setError(err.message || 'Could not copy the plan.'),
  })

  const close = () => {
    setError(null)
    setPicked(null)
    onClose()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      size="md"
      title="Copy a previous edition's plan"
      subtitle="Next year starts from this year."
      icon={<DocumentDuplicateIcon className="size-5" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!selected) return
          setError(null)
          copy.mutate({ fromPlanId: selected })
        }}
        className="space-y-4"
      >
        {sources.isPending && (
          <div className="h-24 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
        )}

        {sources.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {sources.error.message}
          </p>
        )}

        {sources.data?.length === 0 && (
          <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No other edition of this organization has a plan yet. Create this
            one from the template instead.
          </p>
        )}

        {sources.data && sources.data.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-900 dark:text-white">
              Copy from
            </legend>
            {sources.data.map((source) => (
              <label
                key={source.planId}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800',
                  selected === source.planId
                    ? 'border-brand-cloud-blue dark:border-blue-400'
                    : 'border-gray-200 dark:border-gray-700',
                )}
              >
                <input
                  type="radio"
                  name="fromPlanId"
                  value={source.planId}
                  checked={selected === source.planId}
                  onChange={() => {
                    setError(null)
                    setPicked(source.planId)
                  }}
                  className="size-4 border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-gray-900 dark:text-gray-100">
                    {source.conferenceTitle}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {source.startDate ?? 'No date'} · {source.campaigns}{' '}
                    campaigns · {source.tasks} tasks
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500 dark:text-gray-400">
          <li>
            Tasks land on this edition&apos;s milestones at the same offset. A
            task moved by hand follows the milestone nearest to where it was
            moved.
          </li>
          <li>
            Sponsor and speaker cards stay behind; the triggers that made them
            come along and fill this edition as sponsors sign and speakers
            confirm.
          </li>
          <li>
            Copy you never edited is rewritten for this edition; edited copy is
            kept with fresh links. Every post starts as a draft assigned to you.
          </li>
        </ul>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <AdminButton type="button" variant="secondary" onClick={close}>
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            color="brand"
            disabled={!selected || copy.isPending}
          >
            {copy.isPending ? 'Copying…' : 'Copy plan'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
