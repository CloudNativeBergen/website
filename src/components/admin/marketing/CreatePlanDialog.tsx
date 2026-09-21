'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  DocumentIcon,
  RectangleStackIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { OUTCOME_LABELS } from '@/lib/marketing/types'
import {
  BUILTIN_TEMPLATE,
  BUILTIN_TEMPLATE_VERSION,
  optionalCampaigns,
} from '@/lib/marketing/template'
import { formatDateSafe } from '@/lib/time'
import { api } from '@/lib/trpc/client'
import {
  includeOptional,
  optionalPreviewCampaigns,
  previewWindowWords,
} from './templates'

const OPTIONAL = optionalCampaigns(BUILTIN_TEMPLATE)

type Source = 'blank' | 'builtin' | 'template' | 'copy'

const SOURCES: {
  value: Source
  title: string
  description: string
  icon: typeof DocumentIcon
}[] = [
  {
    value: 'blank',
    title: 'Blank',
    description: 'An empty plan. You add every campaign and task yourself.',
    icon: DocumentIcon,
  },
  {
    value: 'builtin',
    title: 'Built-in Template',
    description: `${BUILTIN_TEMPLATE.campaigns.length} campaigns of posts, renders and checklists, scheduled against this edition's milestones.`,
    icon: SparklesIcon,
  },
  {
    value: 'template',
    title: 'An organization Template',
    description:
      'A plan your organization saved as a Template, on this edition’s milestones.',
    icon: RectangleStackIcon,
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
  'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-gray-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-cloud-blue dark:hover:bg-gray-800 dark:has-[:focus-visible]:ring-blue-400'
const optionBorder = (on: boolean) =>
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
  const [pickedTemplate, setPickedTemplate] = useState<string | null>(null)
  const [pickedVersion, setPickedVersion] = useState<number | null>(null)
  // The UNTICKED optional Campaigns: switching version then keeps "everything
  // on" for a Campaign the other version did not have.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  const copySources = api.marketing.plan.copySources.useQuery(undefined, {
    enabled: isOpen && source === 'copy',
  })
  // Needed whenever the dialog is open, not only on the Template source: an
  // organization with no Template is never offered one.
  const templates = api.marketing.template.list.useQuery(undefined, {
    enabled: isOpen,
  })
  const offeredTemplates = templates.data ?? []
  const templateId =
    (offeredTemplates.some((t) => t.templateId === pickedTemplate)
      ? pickedTemplate
      : null) ??
    offeredTemplates[0]?.templateId ??
    null
  const versions = api.marketing.template.versions.useQuery(
    { templateId: templateId ?? '' },
    { enabled: isOpen && source === 'template' && templateId !== null },
  )
  const versionRows = versions.data ?? []
  const version =
    (versionRows.some((row) => row.version === pickedVersion)
      ? pickedVersion
      : null) ??
    versionRows[0]?.version ??
    null
  const templatePreview = api.marketing.template.preview.useQuery(
    { templateId: templateId ?? '', version: version ?? 1 },
    {
      enabled:
        isOpen &&
        source === 'template' &&
        templateId !== null &&
        version !== null,
    },
  )
  const templateOptional = optionalPreviewCampaigns(templatePreview.data)
  // Only a plan the list still offers: a pick that a refetch dropped must not
  // be submitted with no radio showing it.
  const offered = copySources.data ?? []
  const fromPlanId =
    (offered.some((s) => s.planId === pickedPlan) ? pickedPlan : null) ??
    offered[0]?.planId ??
    null

  const mutationOptions = (title: string) => ({
    onSuccess: (result: { campaigns: number; tasks: number }) => {
      void utils.marketing.plan.get.invalidate()
      showNotification({
        type: 'success',
        title,
        message:
          result.campaigns === 0
            ? 'Add the first Campaign in Plan settings.'
            : `${result.campaigns} campaigns, ${result.tasks} tasks.`,
      })
      reset()
    },
    onError: (err: { message: string }) =>
      setError(err.message || 'Could not create the plan.'),
  })
  const create = api.marketing.plan.create.useMutation(
    mutationOptions('Marketing plan created'),
  )
  const copy = api.marketing.plan.copy.useMutation(
    mutationOptions('Marketing plan copied'),
  )
  const pending = create.isPending || copy.isPending

  // The dialog stays mounted while closed, so every way out (Cancel, Escape,
  // backdrop, success) returns it to its first state.
  function reset() {
    setError(null)
    setSource('builtin')
    setInclude(new Set(OPTIONAL.map((c) => c.key)))
    setPickedPlan(null)
    setPickedTemplate(null)
    setPickedVersion(null)
    setExcluded(new Set())
    onClose()
  }
  // Not while a create is in flight: its late error would otherwise land on
  // the closed dialog and greet the next open.
  const close = () => {
    if (!pending) reset()
  }

  const submit = () => {
    setError(null)
    if (source === 'copy') {
      if (fromPlanId) copy.mutate({ fromPlanId })
    } else if (source === 'blank') {
      create.mutate({ source: { type: 'blank' } })
    } else if (source === 'template') {
      if (templateId && version !== null)
        create.mutate({
          source: {
            type: 'template',
            templateId,
            version,
            includeOptional: includeOptional(templatePreview.data, excluded),
          },
        })
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
  const toggleTemplateOptional = (key: string) => {
    setError(null)
    setExcluded((prev) => {
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
        <fieldset className="space-y-2 disabled:opacity-60" disabled={pending}>
          <legend className="sr-only">Start from</legend>
          {SOURCES.filter(
            (s) => s.value !== 'template' || offeredTemplates.length > 0,
          ).map((s) => (
            <label
              key={s.value}
              className={clsx(OPTION, optionBorder(source === s.value))}
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
              {source === s.value && (
                <CheckCircleIcon className="size-5 shrink-0 text-brand-cloud-blue dark:text-blue-300" />
              )}
            </label>
          ))}
        </fieldset>

        {source === 'blank' && (
          <p className={NOTE}>
            Nothing is created but the plan itself. You add campaigns in Plan
            settings, and tasks on each campaign.
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
                <label
                  key={c.key}
                  className={clsx(OPTION, optionBorder(false))}
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
            <p className={NOTE}>
              Every task is assigned to you. Posts are created as drafts;
              nothing publishes until you approve it. Dates on unset milestones
              are flagged provisional so you can spot and fix them.
            </p>
          </>
        )}

        {source === 'template' && (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-900 dark:text-white">
                Template
              </legend>
              {offeredTemplates.map((t) => (
                <label
                  key={t.templateId}
                  className={clsx(
                    OPTION,
                    optionBorder(templateId === t.templateId),
                  )}
                >
                  <input
                    type="radio"
                    name="templateId"
                    value={t.templateId}
                    checked={templateId === t.templateId}
                    onChange={() => {
                      setError(null)
                      setPickedTemplate(t.templateId)
                      // Another Template has its own versions; keeping a number
                      // from the last one would preview the wrong thing.
                      setPickedVersion(null)
                      // …and its own optional Campaigns. Unticks are kept across
                      // VERSIONS of one Template on purpose; across Templates a
                      // shared key (`keynotes`) would arrive silently unticked.
                      setExcluded(new Set())
                    }}
                    className="size-4 border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-gray-900 dark:text-gray-100">
                      {t.name}
                    </span>
                    <span className={clsx('block', NOTE)}>
                      Version {t.latestVersion} · {t.campaigns} campaigns ·{' '}
                      {t.savedAt ? formatDateSafe(t.savedAt) : 'No date'}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {versions.error && (
              // Without the history there is no version to seed from, and Create
              // stays disabled: say why, and offer the way out.
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                The versions of this Template could not be loaded:{' '}
                {versions.error.message}{' '}
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() => void versions.refetch()}
                >
                  Try again
                </button>
              </p>
            )}
            {versionRows.length > 0 && version !== null && (
              <label className="block text-sm font-medium text-gray-900 dark:text-white">
                Version
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  value={version}
                  onChange={(event) => {
                    setError(null)
                    setPickedVersion(Number(event.target.value))
                  }}
                >
                  {/* Version, latest marker and date only: adding who saved it
                      pushed the label past the select's width on a phone, and a
                      truncated option says less than a short one. The full
                      provenance is on the Templates page. */}
                  {versionRows.map((row) => (
                    <option key={row.version} value={row.version}>
                      Version {row.version}
                      {row.version === versionRows[0].version
                        ? ' (latest)'
                        : ''}
                      {row.savedAt ? ` · ${formatDateSafe(row.savedAt)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/* A DISABLED query stays `pending` for ever: without a version (the
                history failed to load) there is nothing to wait for. */}
            {version !== null && templatePreview.isPending && (
              <div
                role="status"
                aria-label="Loading the preview"
                className="h-24 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800"
              />
            )}
            {templatePreview.error && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {templatePreview.error.message}
              </p>
            )}
            {templatePreview.data && (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {templatePreview.data.campaigns.map((campaign) => (
                  <li key={campaign.key} className="py-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {campaign.title}
                      {campaign.optional && (
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          Optional
                        </span>
                      )}
                    </p>
                    <p className={NOTE}>
                      {OUTCOME_LABELS[campaign.primaryOutcome]} ·{' '}
                      {previewWindowWords(campaign)} · {campaign.tasks} tasks
                      {campaign.recipes.length > 0 && ' to start with'}
                    </p>
                    {campaign.recipes.length > 0 && (
                      <p className={NOTE}>
                        Plus what its Recipes create:{' '}
                        {campaign.recipes.join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {templateOptional.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-900 dark:text-white">
                  Optional campaigns
                </legend>
                <p className={NOTE}>
                  Untick the ones this edition is not running.
                </p>
                {templateOptional.map((campaign) => (
                  <label
                    key={campaign.key}
                    className={clsx(OPTION, optionBorder(false))}
                  >
                    <input
                      type="checkbox"
                      name="templateIncludeOptional"
                      value={campaign.key}
                      checked={!excluded.has(campaign.key)}
                      onChange={() => toggleTemplateOptional(campaign.key)}
                      className="size-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                    />
                    <span className="text-gray-900 dark:text-gray-100">
                      {campaign.title}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
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
                        optionBorder(fromPlanId === from.planId),
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
                          {from.startDate
                            ? formatDateSafe(from.startDate)
                            : 'No date'}{' '}
                          · {from.campaigns} campaigns · {from.tasks} tasks
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

        <p className={NOTE}>
          {/* Only a SUCCESSFUL empty answer means there are none: a failed or
              pending list must not read as "your organization owns no
              Templates", with the source silently missing above. */}
          {templates.error ? (
            <span role="alert" className="text-red-600 dark:text-red-400">
              Your organization&apos;s Templates could not be loaded:{' '}
              {templates.error.message}{' '}
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => void templates.refetch()}
              >
                Try again
              </button>{' '}
            </span>
          ) : (
            templates.data?.length === 0 &&
            'Your organization owns no Templates yet — save a plan as a Template to start a later edition from it. '
          )}
          <Link
            href="/admin/marketing/templates"
            className="font-medium text-brand-cloud-blue dark:text-blue-300"
          >
            Manage Templates
          </Link>
        </p>

        <div className="flex justify-end gap-2">
          <AdminButton
            type="button"
            variant="secondary"
            onClick={close}
            disabled={pending}
          >
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            color="brand"
            disabled={
              pending ||
              (source === 'copy' && !fromPlanId) ||
              // The optional-Campaign list comes from the preview: creating
              // before it loads would silently leave every optional one out.
              (source === 'template' &&
                (!templateId || version === null || !templatePreview.data))
            }
          >
            {pending ? 'Creating…' : 'Create plan'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
