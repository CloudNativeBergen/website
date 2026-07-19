'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'

/**
 * SE-1a — the settings tier's first storied, editable component. One shared,
 * fieldset-parameterized editor: an Edit button on a read-only settings
 * InfoCard opens a ModalShell form scoped to a single scalar fieldset, patches
 * ONLY that fieldset via the matching `conference.*` mutation, then
 * `router.refresh()`es the server-rendered card. It is deliberately generic —
 * every fieldset drives the same code path from the `FIELDSET_DEFS` table
 * rather than a bespoke component per card.
 *
 * Scope: SCALAR fieldsets only. Arrays/objects (social links, domains,
 * features, vanity metrics, sponsor benefits, teams, organizers, topics,
 * announcement, logos) stay read-only for later phases.
 */

export type ConferenceFieldsetKey =
  | 'basicInfo'
  | 'venue'
  | 'dates'
  | 'registration'
  | 'communication'
  | 'ticketingIds'
  | 'cfpGoals'

export type EditFieldType =
  'text' | 'textarea' | 'date' | 'email' | 'url' | 'number' | 'boolean'

export interface EditFieldDef {
  name: string
  label: string
  type: EditFieldType
  /** Empty value blocks submit with a "<label> is required" error. */
  required?: boolean
  /** When empty, send `null` to UNSET the field rather than an empty string. */
  nullableWhenEmpty?: boolean
  /** Numeric floor (inclusive) for `number` fields. */
  min?: number
  /** `number` field must be a whole number. */
  integer?: boolean
  /** `number` field must be strictly greater than zero. */
  positive?: boolean
  /** Optional helper text rendered under the control. */
  description?: string
}

interface FieldsetDef {
  title: string
  /** Short line under the modal title. */
  subtitle: string
  fields: EditFieldDef[]
}

/**
 * The single source of truth for what each scalar fieldset contains. Field
 * `name`s are verified against `sanity/schemaTypes/conference.ts`; the server
 * Zod schemas in `src/server/schemas/conference.ts` are the authoritative
 * validators (this table only drives the form + light client-side hints).
 */
export const FIELDSET_DEFS: Record<ConferenceFieldsetKey, FieldsetDef> = {
  basicInfo: {
    title: 'Basic Information',
    subtitle: 'Conference name, host and location',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'organizer', label: 'Organizer', type: 'text', required: true },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'country', label: 'Country', type: 'text' },
      {
        name: 'tagline',
        label: 'Tagline',
        type: 'text',
        nullableWhenEmpty: true,
      },
      {
        name: 'description',
        label: 'Description',
        type: 'textarea',
        nullableWhenEmpty: true,
      },
    ],
  },
  venue: {
    title: 'Venue Information',
    subtitle: 'Where the conference is held',
    fields: [
      {
        name: 'venueName',
        label: 'Venue Name',
        type: 'text',
        nullableWhenEmpty: true,
      },
      {
        name: 'venueAddress',
        label: 'Venue Address',
        type: 'text',
        nullableWhenEmpty: true,
      },
    ],
  },
  dates: {
    title: 'Dates & Timeline',
    subtitle: 'Key conference and CFP dates',
    fields: [
      { name: 'startDate', label: 'Start Date', type: 'date', required: true },
      { name: 'endDate', label: 'End Date', type: 'date', required: true },
      {
        name: 'cfpStartDate',
        label: 'CFP Start Date',
        type: 'date',
        required: true,
      },
      {
        name: 'cfpEndDate',
        label: 'CFP End Date',
        type: 'date',
        required: true,
      },
      {
        name: 'cfpNotifyDate',
        label: 'CFP Notify Date',
        type: 'date',
        required: true,
      },
      {
        name: 'programDate',
        label: 'Program Release Date',
        type: 'date',
        required: true,
      },
      {
        name: 'travelSupportPaymentDate',
        label: 'Travel Support Payment Date',
        type: 'date',
        nullableWhenEmpty: true,
      },
      {
        name: 'travelSupportBudget',
        label: 'Travel Support Budget',
        type: 'number',
        min: 0,
        nullableWhenEmpty: true,
      },
    ],
  },
  registration: {
    title: 'Registration',
    subtitle: 'Ticket registration link and toggle',
    fields: [
      {
        name: 'registrationEnabled',
        label: 'Registration Enabled',
        type: 'boolean',
      },
      {
        name: 'registrationLink',
        label: 'Registration Link',
        type: 'url',
        nullableWhenEmpty: true,
      },
    ],
  },
  communication: {
    title: 'Communication',
    subtitle: 'From-addresses and Slack channels',
    fields: [
      {
        name: 'contactEmail',
        label: 'Contact Email',
        type: 'email',
        required: true,
      },
      { name: 'cfpEmail', label: 'CFP Email', type: 'email', required: true },
      {
        name: 'sponsorEmail',
        label: 'Sponsor Email',
        type: 'email',
        required: true,
      },
      {
        name: 'salesNotificationChannel',
        label: 'Sales / Weekly Update Channel',
        type: 'text',
        nullableWhenEmpty: true,
        description: 'Slack channel, e.g. #conference-updates',
      },
      {
        name: 'cfpNotificationChannel',
        label: 'CFP Notification Channel',
        type: 'text',
        nullableWhenEmpty: true,
        description: 'Slack channel, e.g. #conference-cfp',
      },
    ],
  },
  ticketingIds: {
    title: 'External Integrations',
    subtitle: 'Checkin.no API identifiers',
    fields: [
      {
        name: 'checkinCustomerId',
        label: 'Checkin Customer ID',
        type: 'number',
        integer: true,
        positive: true,
        nullableWhenEmpty: true,
      },
      {
        name: 'checkinEventId',
        label: 'Checkin Event ID',
        type: 'number',
        integer: true,
        positive: true,
        nullableWhenEmpty: true,
      },
    ],
  },
  cfpGoals: {
    title: 'CFP & Revenue Goals',
    subtitle: 'Dashboard tracking targets',
    fields: [
      {
        name: 'cfpSubmissionGoal',
        label: 'CFP Submission Goal',
        type: 'number',
        min: 0,
        nullableWhenEmpty: true,
      },
      {
        name: 'cfpLightningGoal',
        label: 'Lightning Talk Goal',
        type: 'number',
        min: 0,
        nullableWhenEmpty: true,
      },
      {
        name: 'cfpPresentationGoal',
        label: 'Presentation Goal',
        type: 'number',
        min: 0,
        nullableWhenEmpty: true,
      },
      {
        name: 'cfpWorkshopGoal',
        label: 'Workshop Goal',
        type: 'number',
        min: 0,
        nullableWhenEmpty: true,
      },
      {
        name: 'sponsorRevenueGoal',
        label: 'Sponsor Revenue Goal',
        type: 'number',
        min: 0,
        nullableWhenEmpty: true,
      },
    ],
  },
}

const MUTATION_BY_FIELDSET: Record<
  ConferenceFieldsetKey,
  keyof typeof api.conference
> = {
  basicInfo: 'updateBasicInfo',
  venue: 'updateVenue',
  dates: 'updateDates',
  registration: 'updateRegistration',
  communication: 'updateCommunication',
  ticketingIds: 'updateTicketingIds',
  cfpGoals: 'updateCfpGoals',
}

type FormValue = string | boolean
type FormValues = Record<string, FormValue>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidUrl(value: string): boolean {
  try {
    return Boolean(new URL(value))
  } catch {
    return false
  }
}

/** Project the stored conference values into editable form strings/booleans. */
function toFormValues(
  fields: EditFieldDef[],
  initial: Record<string, unknown>,
): FormValues {
  const out: FormValues = {}
  for (const f of fields) {
    const v = initial[f.name]
    if (f.type === 'boolean') {
      out[f.name] = Boolean(v)
    } else {
      out[f.name] = v === null || v === undefined ? '' : String(v)
    }
  }
  return out
}

/** Cross-field rules that can't be expressed per-input. Mirrors the server. */
function crossFieldErrors(
  fieldset: ConferenceFieldsetKey,
  values: FormValues,
): Record<string, string> {
  const errs: Record<string, string> = {}
  if (fieldset === 'dates') {
    const start = values.startDate as string
    const end = values.endDate as string
    const cfpStart = values.cfpStartDate as string
    const cfpEnd = values.cfpEndDate as string
    if (start && end && end < start) {
      errs.endDate = 'End date must be on or after the start date'
    }
    if (cfpStart && cfpEnd && cfpEnd < cfpStart) {
      errs.cfpEndDate = 'CFP end date must be on or after the CFP start date'
    }
  }
  return errs
}

export interface EditConferenceCardProps {
  fieldset: ConferenceFieldsetKey
  /** Current stored values (a superset is fine — only fieldset fields are read). */
  initialValues: Record<string, unknown>
  /** Render the modal open on mount — for stories/tests only. */
  defaultOpen?: boolean
}

/**
 * The Edit affordance for one settings InfoCard. Renders a 44px pencil trigger
 * and, when opened, a ModalShell form for the fieldset. Placed in a card's
 * header on the (server) settings page — the card body keeps rendering the
 * read-only values and re-renders fresh after a successful save.
 */
export function EditConferenceCard({
  fieldset,
  initialValues,
  defaultOpen = false,
}: EditConferenceCardProps) {
  const def = FIELDSET_DEFS[fieldset]
  const { fields } = def
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(fields, initialValues),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const baseline = toFormValues(fields, initialValues)
  const isDirty = JSON.stringify(values) !== JSON.stringify(baseline)

  // `api.conference[procName]` narrows to a union of procedures; select the
  // proc first (plain property access, not a hook) then call `.useMutation`
  // exactly once so the hook order is stable regardless of `fieldset`.
  const proc = api.conference[MUTATION_BY_FIELDSET[fieldset]] as unknown as {
    useMutation: (opts: {
      onSuccess?: () => void
      onError?: (error: { message: string }) => void
    }) => {
      mutate: (input: Record<string, unknown>) => void
      isPending: boolean
    }
  }

  const mutation = proc.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Settings updated',
        message: `${def.title} saved.`,
      })
      setIsOpen(false)
    },
    onError: (error) => {
      setSubmitError(error.message || 'Failed to save. Please try again.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to save conference settings.',
      })
    },
  })

  const resetForm = () => {
    setValues(toFormValues(fields, initialValues))
    setErrors({})
    setSubmitError(null)
  }

  const openModal = () => {
    resetForm()
    setIsOpen(true)
  }

  const closeModal = () => {
    setIsOpen(false)
    resetForm()
  }

  const setValue = (name: string, value: FormValue) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    for (const f of fields) {
      if (f.type === 'boolean') continue
      const raw = values[f.name]
      const s = typeof raw === 'string' ? raw.trim() : ''
      if (f.required && s === '') {
        errs[f.name] = `${f.label} is required`
        continue
      }
      if (s === '') continue
      if (f.type === 'email' && !EMAIL_RE.test(s)) {
        errs[f.name] = 'Enter a valid email address'
      } else if (f.type === 'url' && !isValidUrl(s)) {
        errs[f.name] = 'Enter a valid URL'
      } else if (f.type === 'number') {
        const n = Number(s)
        if (!Number.isFinite(n)) errs[f.name] = 'Enter a number'
        else if (f.integer && !Number.isInteger(n))
          errs[f.name] = 'Must be a whole number'
        else if (f.positive && n <= 0)
          errs[f.name] = 'Must be a positive number'
        else if (f.min !== undefined && n < f.min)
          errs[f.name] = `Must be at least ${f.min}`
      }
    }
    Object.assign(errs, crossFieldErrors(fieldset, values))
    return errs
  }

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {}
    for (const f of fields) {
      const raw = values[f.name]
      if (f.type === 'boolean') {
        payload[f.name] = Boolean(raw)
        continue
      }
      const s = typeof raw === 'string' ? raw.trim() : ''
      if (f.type === 'number') {
        if (s === '') {
          if (f.nullableWhenEmpty) payload[f.name] = null
        } else {
          payload[f.name] = Number(s)
        }
        continue
      }
      if (s === '') {
        payload[f.name] = f.nullableWhenEmpty ? null : ''
      } else {
        payload[f.name] = s
      }
    }
    return payload
  }

  const handleSave = () => {
    setSubmitError(null)
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    mutation.mutate(buildPayload())
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label={`Edit ${def.title}`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="lg"
        title={`Edit ${def.title}`}
        subtitle={def.subtitle}
        icon={<PencilSquareIcon className="h-5 w-5" />}
        confirmOnDirtyClose
        isDirty={isDirty && !mutation.isPending}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-4"
        >
          {fields.map((f) => (
            <EditField
              key={f.name}
              field={f}
              value={values[f.name]}
              error={errors[f.name]}
              onChange={(v) => setValue(f.name, v)}
            />
          ))}

          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={closeModal}
              disabled={mutation.isPending}
              className="min-h-[44px]"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="blue"
              size="md"
              disabled={mutation.isPending || !isDirty}
              className="min-h-[44px]"
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}

const inputClass =
  'block w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'

function EditField({
  field,
  value,
  error,
  onChange,
}: {
  field: EditFieldDef
  value: FormValue
  error?: string
  onChange: (value: FormValue) => void
}) {
  const id = `conf-field-${field.name}`
  const describedBy = error
    ? `${id}-error`
    : field.description
      ? `${id}-desc`
      : undefined

  if (field.type === 'boolean') {
    return (
      <div className="flex min-h-[44px] items-center gap-3">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
        />
        <label
          htmlFor={id}
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {field.label}
        </label>
      </div>
    )
  }

  const stringValue = typeof value === 'string' ? value : ''

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {field.label}
        {field.required ? (
          <span className="text-red-500" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {field.type === 'textarea' ? (
        <textarea
          id={id}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          type={
            field.type === 'number'
              ? 'number'
              : field.type === 'date'
                ? 'date'
                : field.type === 'email'
                  ? 'email'
                  : field.type === 'url'
                    ? 'url'
                    : 'text'
          }
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
      )}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : field.description ? (
        <p
          id={`${id}-desc`}
          className="mt-1 text-xs text-gray-500 dark:text-gray-400"
        >
          {field.description}
        </p>
      ) : null}
    </div>
  )
}
