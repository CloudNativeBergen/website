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
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotificationSafe } from '@/components/admin/NotificationProvider'
import { formatDatesSafe } from '@/lib/time'
import { ORG_SLUG_RE } from '@/lib/onboarding/create'
import type { DomainVerificationView } from '@/lib/domain-verification'
import {
  WIZARD_STEPS,
  WIZARD_STEP_TITLES,
  type WizardStepId,
  type WizardState,
  type OrganizerState,
  stepIndex,
  derivedSlug,
  validateOrganization,
  validateOrganizer,
  validateConference,
  domainsLocalErrors,
  cleanDomains,
  canProceed,
  canCreate,
} from './wizardLogic'

export interface OnboardingWizardProps {
  /** Storybook/deep-link seam: which step to render first. */
  initialStep?: WizardStepId
  /** Storybook seam: seed the wizard state. */
  initialState?: Partial<WizardState>
  /** Storybook seam: seed the organizer identity. */
  initialOrganizer?: OrganizerState
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function OnboardingWizard({
  initialStep = 'organization',
  initialState,
  initialOrganizer,
}: OnboardingWizardProps) {
  const notify = useNotificationSafe()
  const [step, setStep] = useState<WizardStepId>(initialStep)
  const [state, setState] = useState<WizardState>(() => ({
    organization: {
      name: '',
      slug: '',
      slugTouched: false,
      contactEmail: '',
      billingEmail: '',
      ...initialState?.organization,
    },
    conference: {
      title: '',
      city: '',
      country: '',
      startDate: '',
      endDate: '',
      ...initialState?.conference,
    },
    domains: initialState?.domains ?? [''],
  }))
  const [organizer, setOrganizer] = useState<OrganizerState>(
    () => initialOrganizer ?? { name: '', email: '' },
  )

  const [result, setResult] = useState<{
    organizationId: string
    conferenceId: string
    speakerCreated: boolean
    organizerMatchedName: string | null
    challenges: DomainVerificationView[]
  } | null>(null)

  // Debounce the availability probe inputs so keystrokes don't spam the
  // server — and only probe values that already pass the server schema's SHAPE
  // rules (slug regex/length, valid hostnames, well-formed email): a partially
  // typed value would only bounce off input validation as BAD_REQUEST noise.
  const slug = derivedSlug(state.organization)
  const cleanedDomains = useMemo(
    () => cleanDomains(state.domains),
    [state.domains],
  )
  const domainsShapeValid = useMemo(
    () => Object.keys(domainsLocalErrors(state.domains)).length === 0,
    [state.domains],
  )
  const organizerEmail = organizer.email.trim().toLowerCase()
  const [probe, setProbe] = useState<{
    slug?: string
    domains?: string[]
    organizerEmail?: string
  }>({})
  useEffect(() => {
    const t = setTimeout(
      () =>
        setProbe({
          slug: ORG_SLUG_RE.test(slug) && slug.length <= 96 ? slug : undefined,
          domains:
            domainsShapeValid && cleanedDomains.length > 0
              ? cleanedDomains
              : undefined,
          organizerEmail: EMAIL_RE.test(organizerEmail)
            ? organizerEmail
            : undefined,
        }),
      400,
    )
    return () => clearTimeout(t)
  }, [slug, cleanedDomains, domainsShapeValid, organizerEmail])

  const availability = api.onboarding.validateSetup.useQuery(probe, {
    enabled: Boolean(probe.slug || probe.domains || probe.organizerEmail),
  })
  // Only trust the probe verdicts for the CURRENTLY typed values — a stale
  // response for an old slug/domain list must not gate (or ungate) this one.
  const slugTaken = availability.data?.slugTaken === true && probe.slug === slug
  const takenDomains =
    probe.domains &&
    probe.domains.length === cleanedDomains.length &&
    probe.domains.every((d, i) => d === cleanedDomains[i])
      ? (availability.data?.takenDomains ?? [])
      : []
  const organizerProbe =
    probe.organizerEmail === organizerEmail && EMAIL_RE.test(organizerEmail)
      ? availability.data?.organizer
      : undefined
  // An ambiguous email (several speaker accounts) is a DETERMINISTIC server
  // rejection — gate progression/creation on it, don't just warn.
  const organizerAmbiguous = (organizerProbe?.matchCount ?? 0) > 1

  const createMutation = api.onboarding.createOrganization.useMutation({
    onSuccess: (data) => {
      setResult({
        organizationId: data.organizationId,
        conferenceId: data.conferenceId,
        speakerCreated: data.speakerCreated,
        organizerMatchedName: data.organizerMatchedName,
        challenges: data.challenges ?? [],
      })
    },
    onError: (err) => {
      notify?.showNotification({
        type: 'error',
        title: 'Could not create the organization',
        message: err.message,
      })
    },
  })

  const orgErrors = validateOrganization(state.organization, slugTaken)
  const organizerErrors = validateOrganizer(organizer)
  const conferenceErrors = validateConference(state.conference)
  const domainErrors = domainsLocalErrors(state.domains)

  function patchOrg(patch: Partial<WizardState['organization']>) {
    setState((s) => ({
      ...s,
      organization: { ...s.organization, ...patch },
    }))
  }
  function patchConference(patch: Partial<WizardState['conference']>) {
    setState((s) => ({ ...s, conference: { ...s.conference, ...patch } }))
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

  function submit() {
    if (
      !canCreate(state, organizer, slugTaken, takenDomains, organizerAmbiguous)
    )
      return
    createMutation.mutate({
      organization: {
        name: state.organization.name.trim(),
        slug,
        contactEmail: state.organization.contactEmail.trim(),
        billingEmail: state.organization.billingEmail.trim() || null,
      },
      conference: {
        title: state.conference.title.trim(),
        city: state.conference.city.trim(),
        country: state.conference.country.trim(),
        startDate: state.conference.startDate || null,
        endDate: state.conference.endDate || null,
      },
      organizer: {
        name: organizer.name.trim(),
        email: organizerEmail,
      },
      domains: cleanedDomains,
    })
  }

  if (result) {
    return (
      <SuccessPanel
        result={result}
        organizationName={state.organization.name}
        conferenceTitle={state.conference.title}
        organizerEmail={organizerEmail}
        domains={cleanedDomains}
      />
    )
  }

  const idx = stepIndex(step)
  const canGoNext = canProceed(
    step,
    state,
    organizer,
    slugTaken,
    takenDomains,
    organizerAmbiguous,
  )

  return (
    <div className="space-y-6">
      <StepIndicator current={step} />

      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
        {step === 'organization' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The organization is the tenant that will own this conference and
              every future edition.
            </p>
            <Field label="Organization name" error={orgErrors.name}>
              <input
                className={inputClass}
                placeholder="Cloud Native Oslo"
                value={state.organization.name}
                onChange={(e) => patchOrg({ name: e.target.value })}
              />
            </Field>
            <Field
              label="Slug"
              error={orgErrors.slug}
              hint="Stable identifier for the organization. Derived from the name — edit to override."
            >
              <input
                className={inputClass}
                placeholder="cloud-native-oslo"
                value={slug}
                onChange={(e) =>
                  patchOrg({ slug: e.target.value, slugTouched: true })
                }
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Contact email" error={orgErrors.contactEmail}>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="hello@example.org"
                  value={state.organization.contactEmail}
                  onChange={(e) => patchOrg({ contactEmail: e.target.value })}
                />
              </Field>
              <Field
                label="Billing email (optional)"
                error={orgErrors.billingEmail}
                hint="Falls back to the contact email when unset."
              >
                <input
                  type="email"
                  className={inputClass}
                  value={state.organization.billingEmail}
                  onChange={(e) => patchOrg({ billingEmail: e.target.value })}
                />
              </Field>
            </div>

            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <UserCircleIcon className="h-5 w-5" /> First organizer
              </h3>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                The person who will run this tenant. They get admin access on
                their next sign-in with this email.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Name" error={organizerErrors.organizerName}>
                  <input
                    className={inputClass}
                    value={organizer.name}
                    onChange={(e) =>
                      setOrganizer((o) => ({ ...o, name: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Email" error={organizerErrors.organizerEmail}>
                  <input
                    type="email"
                    className={inputClass}
                    value={organizer.email}
                    onChange={(e) =>
                      setOrganizer((o) => ({ ...o, email: e.target.value }))
                    }
                  />
                </Field>
              </div>
              {organizerProbe && organizerProbe.matchCount === 1 && (
                <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                  Matches the existing account{' '}
                  <span className="font-semibold">
                    {organizerProbe.match?.name ?? 'unnamed'}
                  </span>{' '}
                  — it will be made an organizer.
                </p>
              )}
              {organizerProbe && organizerProbe.matchCount === 0 && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  No existing account — one will be created and linked when they
                  first sign in with this email.
                </p>
              )}
              {organizerProbe && organizerProbe.matchCount > 1 && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  This email matches several speaker accounts. Merge the
                  duplicates before onboarding this organizer.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'conference' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The organization&apos;s first conference. Only the basics are
              needed now — everything else is configured from the new
              tenant&apos;s settings.
            </p>
            <Field label="Title" error={conferenceErrors.title}>
              <input
                className={inputClass}
                placeholder="Cloud Native Days Oslo 2027"
                value={state.conference.title}
                onChange={(e) => patchConference({ title: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="City" error={conferenceErrors.city}>
                <input
                  className={inputClass}
                  value={state.conference.city}
                  onChange={(e) => patchConference({ city: e.target.value })}
                />
              </Field>
              <Field label="Country" error={conferenceErrors.country}>
                <input
                  className={inputClass}
                  value={state.conference.country}
                  onChange={(e) => patchConference({ country: e.target.value })}
                />
              </Field>
              <Field
                label="Start date (optional)"
                error={conferenceErrors.startDate}
              >
                <input
                  type="date"
                  className={inputClass}
                  value={state.conference.startDate}
                  onChange={(e) =>
                    patchConference({ startDate: e.target.value })
                  }
                />
              </Field>
              <Field
                label="End date (optional)"
                error={conferenceErrors.endDate}
                hint="Dates can be set later — the activation checklist will prompt for them."
              >
                <input
                  type="date"
                  className={inputClass}
                  value={state.conference.endDate}
                  onChange={(e) => patchConference({ endDate: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}

        {step === 'domains' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Optional. A tenant can start on no domain at all — the conference
              stays unreachable until a hostname is attached from settings and
              DNS points here. Each entry must be a bare hostname not used by
              another conference.
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
            {availability.isFetching && cleanedDomains.length > 0 && (
              <p className="text-xs text-gray-400">Checking availability…</p>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ReviewRow
                label="Organization"
                value={`${state.organization.name} (${slug})`}
              />
              <ReviewRow
                label="Contact email"
                value={state.organization.contactEmail}
              />
              <ReviewRow
                label="Billing email"
                value={state.organization.billingEmail || '— (contact email)'}
              />
              <ReviewRow
                label="First organizer"
                value={`${organizer.name} <${organizerEmail}>`}
              />
              <ReviewRow label="Conference" value={state.conference.title} />
              <ReviewRow
                label="Location"
                value={`${state.conference.city}, ${state.conference.country}`}
              />
              <ReviewRow
                label="Dates"
                value={
                  state.conference.startDate && state.conference.endDate
                    ? formatDatesSafe(
                        state.conference.startDate,
                        state.conference.endDate,
                      )
                    : 'Not set yet'
                }
              />
              <ReviewRow
                label="Domains"
                value={cleanedDomains.join(', ') || 'None yet'}
              />
            </dl>

            <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-700/60 dark:bg-blue-900/20 dark:text-blue-200">
              The new conference starts <strong>unlisted</strong> with
              registration closed and an empty CFP setup. The organizer
              completes it from the activation checklist in their admin
              settings.
            </div>
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
              href="/admin"
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
              disabled={
                !canCreate(
                  state,
                  organizer,
                  slugTaken,
                  takenDomains,
                  organizerAmbiguous,
                ) || createMutation.isPending
              }
              onClick={submit}
            >
              {createMutation.isPending ? 'Creating…' : 'Create organization'}
            </AdminButton>
          )}
        </div>
      </div>
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
  organizationName,
  conferenceTitle,
  organizerEmail,
  domains,
}: {
  result: {
    organizationId: string
    conferenceId: string
    speakerCreated: boolean
    organizerMatchedName: string | null
    challenges: DomainVerificationView[]
  }
  organizationName: string
  conferenceTitle: string
  organizerEmail: string
  domains: string[]
}) {
  const firstDomain = domains[0]
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-green-300 bg-green-50 p-6 dark:border-green-700/60 dark:bg-green-900/20">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
              {organizationName} is on board
            </h3>
            <p className="mt-1 text-sm text-green-800 dark:text-green-200">
              Created the organization (
              <code className="rounded bg-green-100 px-1 dark:bg-green-800/40">
                {result.organizationId}
              </code>
              ) and its first conference{' '}
              <span className="font-medium">{conferenceTitle}</span> (
              <code className="rounded bg-green-100 px-1 dark:bg-green-800/40">
                {result.conferenceId}
              </code>
              ), unlisted and with registration closed.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
        <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
          Organizer access
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {result.speakerCreated ? (
            <>
              A new account was prepared for{' '}
              <span className="font-medium">{organizerEmail}</span>. It links
              automatically the first time they sign in with that email, and
              admin access follows on that sign-in.
            </>
          ) : (
            <>
              The existing account{' '}
              <span className="font-medium">
                {result.organizerMatchedName ?? organizerEmail}
              </span>{' '}
              was made an organizer. Admin access lights up on their next
              sign-in.
            </>
          )}
        </p>
      </div>

      {result.challenges.some((c) => c.recordName) && (
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
            Prove domain ownership
          </h4>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
            The domains are CLAIMED, not proven. Until each TXT record below
            resolves, the domain is not served and is excluded from the sign-in
            redirect allowlist. We re-check daily and drop a domain again the
            moment its record disappears.
          </p>
          <ul className="space-y-3">
            {result.challenges
              .filter((c) => c.recordName && c.recordValue)
              .map((challenge) => (
                <li
                  key={challenge.hostname}
                  className="rounded-md border border-gray-200 p-3 text-xs dark:border-gray-700"
                >
                  <p className="font-mono text-sm break-all text-gray-900 dark:text-white">
                    {challenge.hostname}
                  </p>
                  <p className="mt-2 text-gray-500 dark:text-gray-400">
                    TXT record name
                  </p>
                  <code className="mt-0.5 block rounded bg-gray-50 px-2 py-1 font-mono break-all dark:bg-white/5">
                    {challenge.recordName}
                  </code>
                  <p className="mt-2 text-gray-500 dark:text-gray-400">
                    TXT record value
                  </p>
                  <code className="mt-0.5 block rounded bg-gray-50 px-2 py-1 font-mono break-all dark:bg-white/5">
                    {challenge.recordValue}
                  </code>
                </li>
              ))}
          </ul>
        </div>
      )}

      {firstDomain ? (
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
            Next: the activation checklist
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Once DNS and Vercel domain setup for{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
              {firstDomain}
            </code>{' '}
            point at this platform, the tenant&apos;s admin lives at{' '}
            <a
              href={`https://${firstDomain}/admin/settings`}
              className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              {firstDomain}/admin/settings
            </a>{' '}
            — the Get-started checklist there walks the organizer through dates,
            CFP formats, topics and going live.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">No domain attached yet.</p>
              <p className="mt-1">
                That&apos;s fine — the tenant exists, but it cannot be opened
                until a hostname is attached and DNS points here. When one is
                ready, its admin settings and activation checklist live at{' '}
                <code>&lt;domain&gt;/admin/settings</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <Link
          href="/admin"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          ← Back to admin
        </Link>
      </div>
    </div>
  )
}
