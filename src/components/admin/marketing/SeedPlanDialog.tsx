'use client'

import { useState } from 'react'
import { SparklesIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  BUILTIN_TEMPLATE,
  BUILTIN_TEMPLATE_VERSION,
  optionalCampaigns,
} from '@/lib/marketing/template'
import { api } from '@/lib/trpc/client'

const OPTIONAL = optionalCampaigns(BUILTIN_TEMPLATE)

/**
 * "Create from the built-in Template" (spec §3.1): asks which optional
 * Campaigns to include, then seeds. The Template version is pinned to the
 * one this build ships.
 */
export function SeedPlanDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const [include, setInclude] = useState<Set<string>>(
    () => new Set(OPTIONAL.map((c) => c.key)),
  )
  const [error, setError] = useState<string | null>(null)

  const seed = api.marketing.plan.seed.useMutation({
    onSuccess: (result) => {
      void utils.marketing.plan.get.invalidate()
      showNotification({
        type: 'success',
        title: 'Marketing plan created',
        message: `${result.campaigns} campaigns, ${result.tasks} tasks.`,
      })
      close()
    },
    onError: (err) => setError(err.message || 'Could not create the plan.'),
  })

  // The dialog stays mounted while closed, so every way out (Cancel, Escape,
  // backdrop, success) and every next action clears a previous error.
  const close = () => {
    setError(null)
    onClose()
  }

  const toggle = (key: string) => {
    setError(null)
    setInclude((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      size="md"
      title="Create the Marketing Plan"
      subtitle={`Built-in Template ${BUILTIN_TEMPLATE_VERSION}: ${BUILTIN_TEMPLATE.campaigns.length} campaigns against the edition's milestones.`}
      icon={<SparklesIcon className="size-5" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          seed.mutate({
            templateVersion: BUILTIN_TEMPLATE_VERSION,
            // Edition order, whatever order the boxes were ticked in.
            includeOptional: OPTIONAL.filter((c) => include.has(c.key)).map(
              (c) => c.key,
            ),
          })
        }}
        className="space-y-4"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-900 dark:text-white">
            Optional campaigns
          </legend>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Untick the ones this edition is not running. The other{' '}
            {BUILTIN_TEMPLATE.campaigns.length - OPTIONAL.length} are always
            created.
          </p>
          {OPTIONAL.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <input
                type="checkbox"
                name="includeOptional"
                value={c.key}
                checked={include.has(c.key)}
                onChange={() => toggle(c.key)}
                className="size-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
              />
              <span className="text-gray-900 dark:text-gray-100">
                {c.title}
              </span>
            </label>
          ))}
        </fieldset>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Every task is assigned to you. Posts are created as drafts; nothing
          publishes until you approve it. Dates on unset milestones are flagged
          provisional so you can spot and fix them.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <AdminButton type="button" variant="secondary" onClick={close}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" color="brand" disabled={seed.isPending}>
            {seed.isPending ? 'Creating…' : 'Create plan'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
