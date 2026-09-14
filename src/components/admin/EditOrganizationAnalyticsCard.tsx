'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChartBarIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { POSTHOG_TOKEN_MESSAGE, POSTHOG_TOKEN_PATTERN } from '@/lib/analytics'

/**
 * The Edit affordance for the ORGANIZATION half of the Analytics settings card
 * (issue #1008): the public PostHog project token. Same shape as
 * `EditConferenceCard` — a 44px pencil trigger opening a ModalShell form — but
 * it writes the organization document through `organization.updateAnalytics`,
 * not the conference, because the token is one-per-organization (one PostHog
 * project per organization) and switching an organization switches every one
 * of its editions at once.
 */
export function EditOrganizationAnalyticsCard({
  initialToken,
  defaultOpen = false,
}: {
  initialToken: string | null | undefined
  /** Render the modal open on mount — for stories/tests only. */
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const baseline = initialToken ?? ''

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [token, setToken] = useState(baseline)
  const [error, setError] = useState<string | null>(null)

  const trimmed = token.trim()
  const isDirty = trimmed !== baseline.trim()

  const mutation = api.organization.updateAnalytics.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Settings updated',
        message: trimmed
          ? 'PostHog is now serving analytics for this organization.'
          : 'PostHog token removed.',
      })
      setIsOpen(false)
    },
    onError: (err) => {
      setError(err.message || 'Failed to save. Please try again.')
    },
  })

  const open = () => {
    setToken(baseline)
    setError(null)
    setIsOpen(true)
  }
  const close = () => {
    setIsOpen(false)
    setToken(baseline)
    setError(null)
  }

  const save = () => {
    if (trimmed && !POSTHOG_TOKEN_PATTERN.test(trimmed)) {
      setError(POSTHOG_TOKEN_MESSAGE)
      return
    }
    setError(null)
    mutation.mutate({ analyticsPosthogToken: trimmed === '' ? null : trimmed })
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Edit PostHog project token"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={close}
        size="lg"
        title="PostHog analytics"
        subtitle="One project token for every edition run by this organization"
        icon={<ChartBarIcon className="h-5 w-5" />}
        confirmOnDirtyClose
        isDirty={isDirty || mutation.isPending}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="analyticsPosthogToken"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              PostHog project token
            </label>
            <input
              id="analyticsPosthogToken"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setError(null)
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby="analyticsPosthogToken-help"
              placeholder="phc_…"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <p
              id="analyticsPosthogToken-help"
              className="mt-2 text-sm text-gray-500 dark:text-gray-400"
            >
              The public project token from PostHog → Project settings (EU
              cloud, one project per organization). Visitors on every edition
              are counted anonymously until they accept the analytics cookie.
              Leave blank to serve no PostHog. Once set, the per-conference
              Pirsch code is no longer loaded.
            </p>
            {error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-3">
            <AdminButton
              type="button"
              variant="secondary"
              onClick={close}
              disabled={mutation.isPending}
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              variant="primary"
              disabled={!isDirty || mutation.isPending}
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
