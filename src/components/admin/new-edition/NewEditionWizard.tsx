'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotificationSafe } from '@/components/admin/NotificationProvider'
import {
  CLONE_FAMILIES,
  CLONE_FAMILY_META,
  DEFAULT_CLONE_FLAGS,
  type CloneFamily,
  type CloneFlags,
  type EditionDefaults,
} from '@/lib/conference/edition'
import {
  WIZARD_STEPS,
  WIZARD_STEP_TITLES,
  type WizardStepId,
  type WizardState,
  stepIndex,
  validateBasics,
  domainsLocalErrors,
  cleanDomains,
  canProceed,
  canCreate,
  typeToConfirmMatches,
} from './wizardLogic'

export interface NewEditionWizardProps {
  /** Prefill derived from the current edition (title/year+1, dates+1yr). */
  defaults: EditionDefaults
  /** The current edition's title — shown as the source being cloned. */
  sourceTitle: string
  /** Per-family item counts from the source, shown in the clone checklist. */
  cloneCounts: Partial<Record<CloneFamily, number>>
  /** Storybook/deep-link seam: which step to render first (defaults to Basics). */
  initialStep?: WizardStepId
  /** Storybook seam: seed the domain list (defaults to a single empty row). */
  initialDomains?: string[]
}

interface FieldProps {
  label: string
  children: React.ReactNode
  error?: string
  hint?: string
}

function Field({ label, children, error, hint }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  )
}

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white'

function StepIndicator({ current }: { current: WizardStepId }) {
  const currentIdx = stepIndex(current)
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {WIZARD_STEPS.map((id, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <li key={id} className="flex items-center gap-2">
            <span
              className={[
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                active
                  ? 'bg-indigo-600 text-white'
                  : done
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
              ].join(' ')}
            >
              {done ? <CheckCircleIcon className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={[
                'text-sm',
                active
                  ? 'font-semibold text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400',
              ].join(' ')}
            >
              {WIZARD_STEP_TITLES[id]}
            </span>
            {i < WIZARD_STEPS.length - 1 && (
              <span className="mx-1 h-px w-4 bg-gray-300 dark:bg-gray-600" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function NewEditionWizard({
  defaults,
  sourceTitle,
  cloneCounts,
  initialStep = 'basics',
  initialDomains,
}: NewEditionWizardProps) {
  const notify = useNotificationSafe()
  const [step, setStep] = useState<WizardStepId>(initialStep)
  const [state, setState] = useState<WizardState>(() => ({
    basics: {
      title: defaults.title,
      organizer: defaults.organizer,
      startDate: defaults.startDate,
      endDate: defaults.endDate,
      cfpStartDate: defaults.cfpStartDate,
      cfpEndDate: defaults.cfpEndDate,
      cfpNotifyDate: defaults.cfpNotifyDate,
      programDate: defaults.programDate,
    },
    domains:
      initialDomains && initialDomains.length > 0 ? initialDomains : [''],
    clone: { ...DEFAULT_CLONE_FLAGS },
    confirmTitle: '',
  }))

  const [result, setResult] = useState<{
    conferenceId: string
    summary: Record<string, number>
  } | null>(null)

  // Debounce the domain list before the availability probe so keystrokes don't
  // spam the server.
  const cleaned = useMemo(() => cleanDomains(state.domains), [state.domains])
  const [checkList, setCheckList] = useState<string[]>([])
  useEffect(() => {
    const t = setTimeout(() => setCheckList(cleaned), 400)
    return () => clearTimeout(t)
  }, [cleaned])

  const availability = api.conference.validateNewDomains.useQuery(
    { domains: checkList },
    { enabled: checkList.length > 0 },
  )
  const takenDomains = availability.data?.taken ?? []

  const createMutation = api.conference.createEdition.useMutation({
    onSuccess: (data) => {
      setResult({
        conferenceId: data.conferenceId,
        summary: data.summary as Record<string, number>,
      })
    },
    onError: (err) => {
      notify?.showNotification({
        type: 'error',
        title: 'Could not create the edition',
        message: err.message,
      })
    },
  })

  const basicsErrors = validateBasics(state.basics)
  const domainErrors = domainsLocalErrors(state.domains)

  function patchBasics(patch: Partial<WizardState['basics']>) {
    setState((s) => ({ ...s, basics: { ...s.basics, ...patch } }))
  }
  function setDomain(i: number, value: string) {
    setState((s) => {
      const domains = [...s.domains]
      domains[i] = value
      return { ...s, domains }
    })
  }
  function addDomain() {
    setState((s) => ({ ...s, domains: [...s.domains, ''] }))
  }
  function removeDomain(i: number) {
    setState((s) => ({
      ...s,
      domains:
        s.domains.length > 1 ? s.domains.filter((_, j) => j !== i) : [''],
    }))
  }
  function toggleClone(family: CloneFamily) {
    setState((s) => ({
      ...s,
      clone: { ...s.clone, [family]: !s.clone[family] },
    }))
  }

  function submit() {
    if (!canCreate(state, takenDomains)) return
    createMutation.mutate({
      title: state.basics.title.trim(),
      organizer: state.basics.organizer.trim() || null,
      startDate: state.basics.startDate,
      endDate: state.basics.endDate,
      cfpStartDate: state.basics.cfpStartDate || null,
      cfpEndDate: state.basics.cfpEndDate || null,
      cfpNotifyDate: state.basics.cfpNotifyDate || null,
      programDate: state.basics.programDate || null,
      domains: cleanDomains(state.domains),
      clone: state.clone as CloneFlags,
    })
  }

  if (result) {
    return <SuccessPanel result={result} title={state.basics.title} />
  }

  const idx = stepIndex(step)
  const canGoNext = canProceed(step, state, takenDomains)

  return (
    <div className="space-y-6">
      <StepIndicator current={step} />

      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
        {step === 'basics' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cloning the structure of{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {sourceTitle}
              </span>
              . Title and dates are prefilled one year ahead — adjust as needed.
            </p>
            <Field label="Title" error={basicsErrors.title}>
              <input
                className={inputClass}
                value={state.basics.title}
                onChange={(e) => patchBasics({ title: e.target.value })}
              />
            </Field>
            <Field
              label="Organizer"
              hint="Leave as-is to keep the same organizing body."
            >
              <input
                className={inputClass}
                value={state.basics.organizer}
                onChange={(e) => patchBasics({ organizer: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Start date" error={basicsErrors.startDate}>
                <input
                  type="date"
                  className={inputClass}
                  value={state.basics.startDate}
                  onChange={(e) => patchBasics({ startDate: e.target.value })}
                />
              </Field>
              <Field label="End date" error={basicsErrors.endDate}>
                <input
                  type="date"
                  className={inputClass}
                  value={state.basics.endDate}
                  onChange={(e) => patchBasics({ endDate: e.target.value })}
                />
              </Field>
              <Field label="CFP opens">
                <input
                  type="date"
                  className={inputClass}
                  value={state.basics.cfpStartDate}
                  onChange={(e) =>
                    patchBasics({ cfpStartDate: e.target.value })
                  }
                />
              </Field>
              <Field label="CFP closes" error={basicsErrors.cfpEndDate}>
                <input
                  type="date"
                  className={inputClass}
                  value={state.basics.cfpEndDate}
                  onChange={(e) => patchBasics({ cfpEndDate: e.target.value })}
                />
              </Field>
              <Field label="CFP notify date">
                <input
                  type="date"
                  className={inputClass}
                  value={state.basics.cfpNotifyDate}
                  onChange={(e) =>
                    patchBasics({ cfpNotifyDate: e.target.value })
                  }
                />
              </Field>
              <Field label="Program date">
                <input
                  type="date"
                  className={inputClass}
                  value={state.basics.programDate}
                  onChange={(e) => patchBasics({ programDate: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}

        {step === 'domains' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Which hostnames will serve this edition? Each must be a bare
              hostname and not already used by another conference.
            </p>
            <div className="space-y-2">
              {state.domains.map((domain, i) => {
                const localErr = domainErrors[`domains.${i}`]
                const trimmed = domain.trim().toLowerCase()
                const isTaken = trimmed !== '' && takenDomains.includes(trimmed)
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <input
                        className={inputClass}
                        placeholder="conference.example.com"
                        value={domain}
                        aria-label={`Domain ${i + 1}`}
                        onChange={(e) => setDomain(i, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeDomain(i)}
                        aria-label={`Remove domain ${i + 1}`}
                        className="shrink-0 rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {(localErr || isTaken) && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {localErr ?? 'Already used by another conference'}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={addDomain}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              <PlusIcon className="h-4 w-4" /> Add domain
            </button>
            {domainErrors.domains && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {domainErrors.domains}
              </p>
            )}
            {availability.isFetching && (
              <p className="text-xs text-gray-400">Checking availability…</p>
            )}
          </div>
        )}

        {step === 'clone' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Structure is copied into the new edition. Content — schedules,
              featured talks, announcements, vanity metrics, ticketing and
              check-in IDs — always starts empty.
            </p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {CLONE_FAMILIES.map((family) => {
                const meta = CLONE_FAMILY_META[family]
                const count = cloneCounts[family]
                return (
                  <li
                    key={family}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <label className="flex flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={state.clone[family]}
                        onChange={() => toggleClone(family)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-white">
                          {meta.label}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {meta.description}
                        </span>
                      </span>
                    </label>
                    {typeof count === 'number' && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {count}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ReviewRow label="Title" value={state.basics.title} />
              <ReviewRow
                label="Organizer"
                value={state.basics.organizer || '—'}
              />
              <ReviewRow
                label="Dates"
                value={`${state.basics.startDate} → ${state.basics.endDate}`}
              />
              <ReviewRow
                label="Domains"
                value={cleanDomains(state.domains).join(', ') || '—'}
              />
              <ReviewRow
                label="Cloning"
                value={
                  CLONE_FAMILIES.filter((f) => state.clone[f])
                    .map((f) => CLONE_FAMILY_META[f].label)
                    .join(', ') || 'Nothing'
                }
              />
            </dl>

            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  This creates a brand-new conference document. The current
                  edition is never modified. To confirm, type the new title
                  exactly.
                </p>
              </div>
            </div>

            <Field label={`Type “${state.basics.title}” to confirm`}>
              <input
                className={inputClass}
                value={state.confirmTitle}
                aria-label="Confirm title"
                onChange={(e) =>
                  setState((s) => ({ ...s, confirmTitle: e.target.value }))
                }
              />
            </Field>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          {idx > 0 ? (
            <AdminButton
              variant="secondary"
              onClick={() => setStep(WIZARD_STEPS[idx - 1])}
            >
              <ArrowLeftIcon className="mr-1 h-4 w-4" /> Back
            </AdminButton>
          ) : (
            <Link
              href="/admin/settings"
              className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cancel
            </Link>
          )}
        </div>
        <div>
          {step !== 'review' ? (
            <AdminButton
              disabled={!canGoNext}
              onClick={() => setStep(WIZARD_STEPS[idx + 1])}
            >
              Next <ArrowRightIcon className="ml-1 h-4 w-4" />
            </AdminButton>
          ) : (
            <AdminButton
              color="red"
              disabled={
                !canCreate(state, takenDomains) || createMutation.isPending
              }
              onClick={submit}
            >
              {createMutation.isPending ? 'Creating…' : 'Create edition'}
            </AdminButton>
          )}
        </div>
      </div>

      {step === 'review' &&
        !typeToConfirmMatches(state.confirmTitle, state.basics.title) && (
          <p className="text-right text-xs text-gray-400">
            Type the exact title to enable Create.
          </p>
        )}
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm break-words text-gray-900 dark:text-white">
        {value}
      </dd>
    </div>
  )
}

function SuccessPanel({
  result,
  title,
}: {
  result: { conferenceId: string; summary: Record<string, number> }
  title: string
}) {
  const entries = Object.entries(result.summary).filter(([, n]) => n > 0)
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-green-300 bg-green-50 p-6 dark:border-green-700/60 dark:bg-green-900/20">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
              {title} created
            </h3>
            <p className="mt-1 text-sm text-green-800 dark:text-green-200">
              A new conference document was created (
              <code className="rounded bg-green-100 px-1 dark:bg-green-800/40">
                {result.conferenceId}
              </code>
              ).
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
        <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
          Cloned
        </h4>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {entries.map(([family, n]) => (
            <li
              key={family}
              className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/50"
            >
              <span className="text-gray-700 dark:text-gray-200">
                {family === 'conference'
                  ? 'Conference'
                  : (CLONE_FAMILY_META[family as CloneFamily]?.label ?? family)}
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {n}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              The new edition is not reachable yet.
            </p>
            <p className="mt-1">
              Serving its domain requires DNS and Vercel domain setup outside
              this app. Until that domain resolves to the site, the new edition
              cannot be opened here — there is nothing to link to.
            </p>
          </div>
        </div>
      </div>

      <div>
        <Link
          href="/admin/settings"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          ← Back to settings
        </Link>
      </div>
    </div>
  )
}
