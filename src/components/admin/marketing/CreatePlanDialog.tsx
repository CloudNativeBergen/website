'use client'

import { useState } from 'react'
import clsx from 'clsx'
import {
  CalendarDaysIcon,
  DocumentDuplicateIcon,
  DocumentIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
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

type Source = 'blank' | 'builtin' | 'copy'

const SOURCES: {
  value: Source
  title: string
  description: string
  icon: typeof DocumentIcon
}[] = [
  {
    value: 'blank',
    title: 'Blank',
    description: 'An empty plan. You add every Campaign and Task yourself.',
    icon: DocumentIcon,
  },
  {
    value: 'builtin',
    title: 'Built-in Template',
    description: `${BUILTIN_TEMPLATE.campaigns.length} campaigns of posts, renders and checklists, scheduled against this edition's milestones.`,
    icon: SparklesIcon,
  },
  {
    value: 'copy',
    title: 'Copy a previous edition',
    description:
      "Another edition's plan, moved onto this edition's milestones.",
    icon: DocumentDuplicateIcon,
  },
]

const NOTE = 'text-xs text-gray-500 dark:text-gray-400'
const OPTION =
  'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-gray-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-cloud-blue dark:hover:bg-gray-800'
const picked = (on: boolean) =>
  on
    ? 'border-brand-cloud-blue dark:border-blue-400'
    : 'border-gray-200 dark:border-gray-700'

/**
 * The one "Create plan" action (Templates spec §3): pick what the plan starts
 * from — blank, the built-in Template (pinned to the version this build
 * ships) or a previous edition — then create it.
 */
export function CreatePlanDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const [source, setSource] = useState<Source>('builtin')
  const [include, setInclude] = useState<Set<string>>(
    () => new Set(OPTIONAL.map((c) => c.key)),
  )
  const [pickedPlan, setPickedPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const copySources = api.marketing.plan.copySources.useQuery(undefined, {
    enabled: isOpen && source === 'copy',
  })
  const fromPlanId = pickedPlan ?? copySources.data?.[0]?.planId ?? null

  // The dialog stays mounted while closed, so every way out (Cancel, Escape,
  // backdrop, success) and every next action clears a previous error.
  const close = () => {
    setError(null)
    setPickedPlan(null)
    onClose()
  }

  const mutation = {
    onSuccess: (result: { campaigns: number; tasks: number }) => {
      void utils.marketing.plan.get.invalidate()
      showNotification({
        type: 'success',
        title: 'Marketing plan created',
        message:
          result.campaigns === 0
            ? 'Add the first Campaign in Plan settings.'
            : `${result.campaigns} campaigns, ${result.tasks} tasks.`,
      })
      close()
    },
    onError: (err: { message: string }) =>
      setError(err.message || 'Could not create the plan.'),
  }
  const create = api.marketing.plan.create.useMutation(mutation)
  const copy = api.marketing.plan.copy.useMutation(mutation)
  const pending = create.isPending || copy.isPending

  const submit = () => {
    setError(null)
    if (source === 'copy') {
      if (fromPlanId) copy.mutate({ fromPlanId })
    } else if (source === 'blank') {
      create.mutate({ source: { type: 'blank' } })
    } else {
      create.mutate({
        source: {
          type: 'builtin',
          templateVersion: BUILTIN_TEMPLATE_VERSION,
          // Edition order, whatever order the boxes were ticked in.
          includeOptional: OPTIONAL.filter((c) => include.has(c.key)).map(
            (c) => c.key,
          ),
        },
      })
    }
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
      subtitle="Choose a starting point."
      icon={<CalendarDaysIcon className="size-5" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-4"
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">Start from</legend>
          {SOURCES.map((s) => (
            <label
              key={s.value}
              className={clsx(OPTION, picked(source === s.value))}
            >
              <input
                type="radio"
                name="source"
                value={s.value}
                checked={source === s.value}
                onChange={() => {
                  setError(null)
                  setSource(s.value)
                }}
                className="sr-only"
              />
              <s.icon
                className={clsx(
                  'size-5 shrink-0',
                  source === s.value
                    ? 'text-brand-cloud-blue dark:text-blue-300'
                    : 'text-gray-400',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900 dark:text-gray-100">
                  {s.title}
                </span>
                <span className={clsx('block', NOTE)}>{s.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {source === 'blank' && (
          <p className={NOTE}>
            Nothing is created but the plan itself. You add Campaigns in Plan
            settings, and Tasks on each Campaign.
          </p>
        )}

        {source === 'builtin' && (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-900 dark:text-white">
                Optional campaigns
              </legend>
              <p className={NOTE}>
                Template {BUILTIN_TEMPLATE_VERSION}. Untick the ones this
                edition is not running. The other{' '}
                {BUILTIN_TEMPLATE.campaigns.length - OPTIONAL.length} are always
                created.
              </p>
              {OPTIONAL.map((c) => (
                <label key={c.key} className={clsx(OPTION, picked(false))}>
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
            <p className={NOTE}>
              Every task is assigned to you. Posts are created as drafts;
              nothing publishes until you approve it. Dates on unset milestones
              are flagged provisional so you can spot and fix them.
            </p>
          </>
        )}

        {source === 'copy' && (
          <>
            {copySources.isPending && (
              <div className="h-24 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
            )}
            {copySources.error && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {copySources.error.message}
              </p>
            )}
            {copySources.data?.length === 0 && (
              <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No other edition of this organization has a plan yet. Start
                blank or from the built-in Template instead.
              </p>
            )}
            {copySources.data && copySources.data.length > 0 && (
              <>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-gray-900 dark:text-white">
                    Copy from
                  </legend>
                  {copySources.data.map((from) => (
                    <label
                      key={from.planId}
                      className={clsx(
                        OPTION,
                        picked(fromPlanId === from.planId),
                      )}
                    >
                      <input
                        type="radio"
                        name="fromPlanId"
                        value={from.planId}
                        checked={fromPlanId === from.planId}
                        onChange={() => {
                          setError(null)
                          setPickedPlan(from.planId)
                        }}
                        className="size-4 border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-gray-900 dark:text-gray-100">
                          {from.conferenceTitle}
                        </span>
                        <span className={clsx('block', NOTE)}>
                          {from.startDate ?? 'No date'} · {from.campaigns}{' '}
                          campaigns · {from.tasks} tasks
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <ul className={clsx('list-disc space-y-1 pl-5', NOTE)}>
                  <li>
                    Tasks land on this edition&apos;s milestones at the same
                    offset. A task moved by hand follows the milestone nearest
                    to where it was moved.
                  </li>
                  <li>
                    Sponsor and speaker cards stay behind; the triggers that
                    made them come along and fill this edition as sponsors sign
                    and speakers confirm.
                  </li>
                  <li>
                    Copy you never edited is rewritten for this edition; edited
                    copy is kept with fresh links. Every post starts as a draft
                    assigned to you.
                  </li>
                </ul>
              </>
            )}
          </>
        )}

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
            disabled={pending || (source === 'copy' && !fromPlanId)}
          >
            {pending ? 'Creating…' : 'Create plan'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
