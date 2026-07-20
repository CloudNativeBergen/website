'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { HEROICON_OPTIONS } from '../../../sanity/schemaTypes/constants'
import { domainServesHost } from '@/lib/conference/domains'
import {
  type ListRow,
  TEMP_KEY_PREFIX,
  buildStringListPayload,
  buildObjectListPayload,
  validateStringList,
  validateObjectList,
  moveRow,
} from './editConferenceLists'
import { useNotification } from './NotificationProvider'

/**
 * SE-1a/SE-1b — the settings tier's shared, fieldset-parameterized editor. An
 * Edit button on a read-only settings InfoCard opens a ModalShell form scoped to
 * a single fieldset, patches ONLY that fieldset via the matching `conference.*`
 * mutation, then `router.refresh()`es the server-rendered card. It is
 * deliberately generic — every fieldset drives the same code path from the
 * `FIELDSET_DEFS` table rather than a bespoke component per card.
 *
 * SE-1a covered SCALAR fieldsets. SE-1b adds three renderers:
 *   - `string-list`  — an add/remove/reorder list of strings (social links,
 *     features, domains), with per-row URL/hostname validation and an optional
 *     known-value checkbox set (features).
 *   - `object-list`  — the same row machinery over multi-column objects (vanity
 *     metrics, sponsor benefits) with text / textarea / select columns.
 *   - a `dangerous` fieldset option — a type-to-confirm gate + red Save,
 *     currently driving the safeguarded Domains editor (also locks the row that
 *     serves the current host).
 *
 * Still read-only for later phases: teams, organizers, topics, announcement,
 * logos.
 */

export type ConferenceFieldsetKey =
  | 'basicInfo'
  | 'venue'
  | 'dates'
  | 'registration'
  | 'communication'
  | 'ticketingIds'
  | 'cfpGoals'
  | 'socialLinks'
  | 'features'
  | 'vanityMetrics'
  | 'sponsorBenefits'
  | 'sponsorshipCustomization'
  | 'domains'

export type EditFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'email'
  | 'url'
  | 'number'
  | 'boolean'
  | 'string-list'
  | 'object-list'

/** A column within an `object-list` row. */
export interface ObjectListColumn {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select'
  required?: boolean
  /** Options for a `select` column (value stored, title shown). */
  options?: readonly { value: string; title: string }[]
}

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
  // --- list options (`string-list` / `object-list`) ---
  /** Per-row validation for a `string-list`. */
  itemType?: 'text' | 'url' | 'hostname'
  /** Singular noun for the "Add <itemLabel>" button and row aria-labels. */
  itemLabel?: string
  /** Known togg[e]able values rendered as checkboxes above a `string-list`. */
  knownValues?: readonly { value: string; title: string }[]
  /** `false` requires at least one row (default: empty list allowed). */
  allowEmptyList?: boolean
  /**
   * `string-list` only: lock (make non-removable) the row that serves the
   * current request host. Drives the Domains safeguard.
   */
  lockCurrent?: boolean
  /** Columns for an `object-list`. */
  columns?: ObjectListColumn[]
}

interface FieldsetDef {
  title: string
  /** Short line under the modal title. */
  subtitle: string
  fields: EditFieldDef[]
  /**
   * Marks a destructive fieldset. When set, the modal shows a warning banner and
   * a type-to-confirm input gating a RED Save button — reusable for any future
   * dangerous fieldset. The Domains fieldset uses it with the current host as the
   * confirm token (supplied at runtime via the `currentDomain` prop).
   */
  dangerous?: { warning: string }
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
      { name: 'city', label: 'City', type: 'text', nullableWhenEmpty: true },
      {
        name: 'country',
        label: 'Country',
        type: 'text',
        nullableWhenEmpty: true,
      },
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
  socialLinks: {
    title: 'Social Links',
    subtitle: 'Public social profile URLs',
    fields: [
      {
        name: 'socialLinks',
        label: 'Social Links',
        type: 'string-list',
        itemType: 'url',
        itemLabel: 'link',
        description: 'Full URLs, e.g. https://bsky.app/profile/…',
      },
    ],
  },
  features: {
    title: 'Features',
    subtitle: 'Experimental feature flags',
    fields: [
      {
        name: 'features',
        label: 'Features',
        type: 'string-list',
        itemType: 'text',
        itemLabel: 'flag',
        // Only one known flag exists today (`test_feature`) and nothing reads
        // the field at runtime, so the UI offers the known toggle plus a free
        // list for custom/unknown flags.
        knownValues: [{ value: 'test_feature', title: 'Test Feature' }],
        description: 'Toggle a known flag, or add a custom flag string.',
      },
    ],
  },
  vanityMetrics: {
    title: 'Vanity Metrics',
    subtitle: 'Landing-page highlight numbers',
    fields: [
      {
        name: 'vanityMetrics',
        label: 'Metrics',
        type: 'object-list',
        itemLabel: 'metric',
        columns: [
          { name: 'label', label: 'Label', type: 'text', required: true },
          { name: 'value', label: 'Value', type: 'text', required: true },
        ],
      },
    ],
  },
  sponsorBenefits: {
    title: 'Sponsor Benefits',
    subtitle: '“Why sponsor” selling points',
    fields: [
      {
        name: 'sponsorBenefits',
        label: 'Benefits',
        type: 'object-list',
        itemLabel: 'benefit',
        columns: [
          { name: 'title', label: 'Title', type: 'text', required: true },
          {
            name: 'description',
            label: 'Description',
            type: 'textarea',
            required: true,
          },
          {
            name: 'icon',
            label: 'Icon',
            type: 'select',
            options: HEROICON_OPTIONS,
          },
        ],
      },
    ],
  },
  sponsorshipCustomization: {
    title: 'Sponsorship Page',
    subtitle: 'Hero, philosophy & prospectus copy',
    fields: [
      {
        name: 'heroHeadline',
        label: 'Hero Headline',
        type: 'text',
        nullableWhenEmpty: true,
      },
      {
        name: 'heroSubheadline',
        label: 'Hero Subheadline',
        type: 'textarea',
        nullableWhenEmpty: true,
      },
      {
        name: 'packageSectionTitle',
        label: 'Package Section Title',
        type: 'text',
        nullableWhenEmpty: true,
      },
      {
        name: 'addonSectionTitle',
        label: 'Addon Section Title',
        type: 'text',
        nullableWhenEmpty: true,
      },
      {
        name: 'philosophyTitle',
        label: 'Philosophy Title',
        type: 'text',
        nullableWhenEmpty: true,
      },
      {
        name: 'philosophyDescription',
        label: 'Philosophy Description',
        type: 'textarea',
        nullableWhenEmpty: true,
      },
      {
        name: 'closingQuote',
        label: 'Closing Quote',
        type: 'text',
        nullableWhenEmpty: true,
      },
      {
        name: 'closingCtaText',
        label: 'Closing CTA Text',
        type: 'text',
        nullableWhenEmpty: true,
      },
      {
        name: 'prospectusUrl',
        label: 'Prospectus PDF/Link',
        type: 'url',
        nullableWhenEmpty: true,
        description: 'Optional link to the full sponsorship prospectus',
      },
    ],
  },
  domains: {
    title: 'Domains',
    subtitle: 'Hostnames that route to this conference',
    dangerous: {
      warning:
        'Domains control which conference this site serves. Removing a wrong entry can take the site down.',
    },
    fields: [
      {
        name: 'domains',
        label: 'Domains',
        type: 'string-list',
        itemType: 'hostname',
        itemLabel: 'domain',
        allowEmptyList: false,
        lockCurrent: true,
        description: 'Bare hostnames, e.g. cloudnativebergen.no (no https://).',
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
  socialLinks: 'updateSocialLinks',
  features: 'updateFeatures',
  vanityMetrics: 'updateVanityMetrics',
  sponsorBenefits: 'updateSponsorBenefits',
  sponsorshipCustomization: 'updateSponsorshipCustomization',
  domains: 'updateDomains',
}

type FormValue = string | boolean | string[] | ListRow[]
type FormValues = Record<string, FormValue>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidUrl(value: string): boolean {
  try {
    return Boolean(new URL(value))
  } catch {
    return false
  }
}

/** A row's `_key` we minted client-side for a brand-new row (server re-keys). */
let tempKeyCounter = 0
const nextTempKey = () => `${TEMP_KEY_PREFIX}${++tempKeyCounter}`

/** Project the stored conference values into editable form values. */
function toFormValues(
  fields: EditFieldDef[],
  initial: Record<string, unknown>,
): FormValues {
  const out: FormValues = {}
  for (const f of fields) {
    const v = initial[f.name]
    if (f.type === 'boolean') {
      out[f.name] = Boolean(v)
    } else if (f.type === 'string-list') {
      out[f.name] = Array.isArray(v) ? v.map((x) => String(x ?? '')) : []
    } else if (f.type === 'object-list') {
      const cols = f.columns ?? []
      out[f.name] = Array.isArray(v)
        ? (v as Record<string, unknown>[]).map((row) => {
            const r: ListRow = {}
            for (const c of cols) {
              const cell = row?.[c.name]
              r[c.name] =
                cell === null || cell === undefined ? '' : String(cell)
            }
            // Preserve the real Sanity `_key` so unchanged rows keep it.
            const key = row?._key
            r._key = typeof key === 'string' ? key : nextTempKey()
            return r
          })
        : []
    } else {
      out[f.name] = v === null || v === undefined ? '' : String(v)
    }
  }
  return out
}

/** Strip client-only `_key`s so dirty-comparison tracks content, not identity. */
function comparable(values: FormValues): FormValues {
  const out: FormValues = {}
  for (const [k, v] of Object.entries(values)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
      out[k] = (v as ListRow[]).map((row) => {
        const rest: ListRow = {}
        for (const [ck, cv] of Object.entries(row)) {
          if (ck !== '_key') rest[ck] = cv
        }
        return rest
      })
    } else {
      out[k] = v
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
  /**
   * The host the request is currently served on. For the safeguarded Domains
   * fieldset this both LOCKS the row that serves it (can't be removed) and is the
   * literal string the user must type to confirm a destructive save. Supplied by
   * the server settings page from the resolved request domain.
   */
  currentDomain?: string
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
  currentDomain,
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
  // Type-to-confirm input for a `dangerous` fieldset (empty otherwise).
  const [confirmInput, setConfirmInput] = useState('')

  const baseline = toFormValues(fields, initialValues)
  const isDirty =
    JSON.stringify(comparable(values)) !== JSON.stringify(comparable(baseline))

  // A dangerous fieldset gates Save behind typing the confirm token (the current
  // host). Without a token to type against, the gate can't be satisfied.
  const dangerous = def.dangerous
  const confirmToken = currentDomain ?? ''
  const confirmSatisfied =
    !dangerous || (confirmToken !== '' && confirmInput.trim() === confirmToken)

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
    setConfirmInput('')
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
    // Clear the field's own error and any per-row errors keyed under it
    // (`<name>.<row>` / `<name>.<row>.<col>`) so edits dismiss stale messages.
    setErrors((prev) => {
      const keys = Object.keys(prev).filter(
        (k) => k === name || k.startsWith(`${name}.`),
      )
      if (keys.length === 0) return prev
      const next = { ...prev }
      for (const k of keys) delete next[k]
      return next
    })
  }

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    for (const f of fields) {
      if (f.type === 'boolean') continue
      if (f.type === 'string-list') {
        Object.assign(errs, validateStringList(f, values[f.name] as string[]))
        continue
      }
      if (f.type === 'object-list') {
        Object.assign(errs, validateObjectList(f, values[f.name] as ListRow[]))
        continue
      }
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
      if (f.type === 'string-list') {
        payload[f.name] = buildStringListPayload(raw as string[])
        continue
      }
      if (f.type === 'object-list') {
        payload[f.name] = buildObjectListPayload(
          f.columns ?? [],
          raw as ListRow[],
        )
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
    if (!confirmSatisfied) return
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
          {dangerous ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
            >
              <ExclamationTriangleIcon
                className="mt-0.5 h-5 w-5 shrink-0"
                aria-hidden="true"
              />
              <span>{dangerous.warning}</span>
            </div>
          ) : null}

          {fields.map((f) => (
            <EditField
              key={f.name}
              field={f}
              value={values[f.name]}
              error={errors[f.name]}
              rowErrors={errors}
              currentDomain={currentDomain}
              onChange={(v) => setValue(f.name, v)}
            />
          ))}

          {dangerous ? (
            <DangerousConfirm
              token={confirmToken}
              value={confirmInput}
              onChange={setConfirmInput}
            />
          ) : null}

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
              color={dangerous ? 'red' : 'blue'}
              size="md"
              disabled={mutation.isPending || !isDirty || !confirmSatisfied}
              className="min-h-[44px]"
            >
              {mutation.isPending
                ? 'Saving…'
                : dangerous
                  ? 'Save domains'
                  : 'Save'}
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
  rowErrors,
  currentDomain,
  onChange,
}: {
  field: EditFieldDef
  value: FormValue
  error?: string
  /** The full error map, so list editors can pull their `<name>.<row>` keys. */
  rowErrors?: Record<string, string>
  currentDomain?: string
  onChange: (value: FormValue) => void
}) {
  const id = `conf-field-${field.name}`
  const describedBy = error
    ? `${id}-error`
    : field.description
      ? `${id}-desc`
      : undefined

  if (field.type === 'string-list') {
    return (
      <StringListEditor
        field={field}
        rows={(value as string[]) ?? []}
        errors={rowErrors ?? {}}
        currentDomain={currentDomain}
        onChange={(rows) => onChange(rows)}
      />
    )
  }

  if (field.type === 'object-list') {
    return (
      <ObjectListEditor
        field={field}
        rows={(value as ListRow[]) ?? []}
        errors={rowErrors ?? {}}
        onChange={(rows) => onChange(rows)}
      />
    )
  }

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

// Shared 44×44 row-control button (reorder / delete / lock).
const rowBtnClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800'

/** Reorder up/down controls shared by both list editors. */
function ReorderControls({
  index,
  count,
  label,
  onMove,
}: {
  index: number
  count: number
  label: string
  onMove: (from: number, to: number) => void
}) {
  return (
    <>
      <button
        type="button"
        className={rowBtnClass}
        onClick={() => onMove(index, index - 1)}
        disabled={index === 0}
        aria-label={`Move ${label} up`}
      >
        <ChevronUpIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        className={rowBtnClass}
        onClick={() => onMove(index, index + 1)}
        disabled={index === count - 1}
        aria-label={`Move ${label} down`}
      >
        <ChevronDownIcon className="h-5 w-5" />
      </button>
    </>
  )
}

/**
 * Type-to-confirm gate for a `dangerous` fieldset. Save stays disabled until the
 * user types `token` (the current host) verbatim. When no token is available it
 * says so, keeping Save disabled.
 */
function DangerousConfirm({
  token,
  value,
  onChange,
}: {
  token: string
  value: string
  onChange: (v: string) => void
}) {
  const id = 'conf-danger-confirm'
  if (token === '') {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        The current domain could not be determined, so saving is disabled.
      </p>
    )
  }
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Type{' '}
        <code className="font-mono text-red-600 dark:text-red-400">
          {token}
        </code>{' '}
        to confirm
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-label={`Type ${token} to confirm`}
        className={inputClass}
      />
    </div>
  )
}

/** Add/remove/reorder editor for an array of strings (URLs, hostnames, flags). */
function StringListEditor({
  field,
  rows,
  errors,
  currentDomain,
  onChange,
}: {
  field: EditFieldDef
  rows: string[]
  errors: Record<string, string>
  currentDomain?: string
  onChange: (rows: string[]) => void
}) {
  const noun = field.itemLabel ?? 'entry'
  const listErr = errors[field.name]
  const knownValues = field.knownValues ?? []
  const knownSet = new Set(knownValues.map((k) => k.value))
  // Rows shown as editable text inputs — known values are represented by the
  // checkbox strip instead, so they're excluded here.
  const visible = rows
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => !knownSet.has(value))

  const inputType =
    field.itemType === 'url'
      ? 'url'
      : field.itemType === 'hostname'
        ? 'url'
        : 'text'

  const setRow = (index: number, v: string) =>
    onChange(rows.map((r, i) => (i === index ? v : r)))
  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index))
  const addRow = () => onChange([...rows, ''])
  // Reorder within the visible sublist maps to swapping the two real indices.
  const moveVisible = (fromPos: number, toPos: number) => {
    if (toPos < 0 || toPos >= visible.length) return
    onChange(moveRow(rows, visible[fromPos].index, visible[toPos].index))
  }
  const toggleKnown = (val: string) => {
    onChange(
      rows.includes(val) ? rows.filter((r) => r !== val) : [...rows, val],
    )
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {field.label}
      </legend>

      {knownValues.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {knownValues.map((k) => {
            const cid = `conf-known-${field.name}-${k.value}`
            return (
              <label
                key={k.value}
                htmlFor={cid}
                className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  id={cid}
                  type="checkbox"
                  checked={rows.includes(k.value)}
                  onChange={() => toggleKnown(k.value)}
                  className="h-5 w-5 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                />
                {k.title}
              </label>
            )
          })}
        </div>
      ) : null}

      <ul className="space-y-2">
        {visible.map(({ value, index }, pos) => {
          const rowErr = errors[`${field.name}.${index}`]
          const locked = Boolean(
            field.lockCurrent &&
            currentDomain &&
            domainServesHost(value, currentDomain),
          )
          const rowId = `conf-${field.name}-${index}`
          return (
            <li key={index}>
              <div className="flex items-start gap-1">
                <input
                  id={rowId}
                  type={inputType}
                  value={value}
                  onChange={(e) => setRow(index, e.target.value)}
                  aria-label={`${noun} ${pos + 1}`}
                  aria-invalid={rowErr ? true : undefined}
                  className={inputClass}
                />
                <ReorderControls
                  index={pos}
                  count={visible.length}
                  label={`${noun} ${pos + 1}`}
                  onMove={moveVisible}
                />
                {locked ? (
                  <span
                    className={`${rowBtnClass} cursor-not-allowed opacity-70`}
                    title="You cannot remove the domain you are currently using"
                    aria-label={`${noun} ${pos + 1} is the current domain and cannot be removed`}
                  >
                    <LockClosedIcon className="h-5 w-5" />
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`${rowBtnClass} hover:text-red-600`}
                    onClick={() => removeRow(index)}
                    aria-label={`Remove ${noun} ${pos + 1}`}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
              {rowErr ? (
                <p
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {rowErr}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-300"
      >
        <PlusIcon className="h-5 w-5" />
        Add {noun}
      </button>

      {listErr ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {listErr}
        </p>
      ) : field.description ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {field.description}
        </p>
      ) : null}
    </fieldset>
  )
}

/** Add/remove/reorder editor for an array of multi-column objects. */
function ObjectListEditor({
  field,
  rows,
  errors,
  onChange,
}: {
  field: EditFieldDef
  rows: ListRow[]
  errors: Record<string, string>
  onChange: (rows: ListRow[]) => void
}) {
  const noun = field.itemLabel ?? 'row'
  const cols = field.columns ?? []

  const setCell = (index: number, col: string, v: string) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, [col]: v } : r)))
  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index))
  const addRow = () => {
    const blank: ListRow = { _key: nextTempKey() }
    for (const c of cols) blank[c.name] = ''
    onChange([...rows, blank])
  }
  const move = (from: number, to: number) => onChange(moveRow(rows, from, to))

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {field.label}
      </legend>

      <ul className="space-y-3">
        {rows.map((row, index) => (
          <li
            key={row._key ?? index}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                {noun} {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <ReorderControls
                  index={index}
                  count={rows.length}
                  label={`${noun} ${index + 1}`}
                  onMove={move}
                />
                <button
                  type="button"
                  className={`${rowBtnClass} hover:text-red-600`}
                  onClick={() => removeRow(index)}
                  aria-label={`Remove ${noun} ${index + 1}`}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {cols.map((c) => {
                const cellId = `conf-${field.name}-${index}-${c.name}`
                const cellErr = errors[`${field.name}.${index}.${c.name}`]
                return (
                  <div key={c.name}>
                    <label
                      htmlFor={cellId}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {c.label}
                      {c.required ? (
                        <span className="text-red-500" aria-hidden="true">
                          {' '}
                          *
                        </span>
                      ) : null}
                    </label>
                    {c.type === 'textarea' ? (
                      <textarea
                        id={cellId}
                        value={row[c.name] ?? ''}
                        onChange={(e) => setCell(index, c.name, e.target.value)}
                        rows={3}
                        aria-invalid={cellErr ? true : undefined}
                        className={inputClass}
                      />
                    ) : c.type === 'select' ? (
                      <select
                        id={cellId}
                        value={row[c.name] ?? ''}
                        onChange={(e) => setCell(index, c.name, e.target.value)}
                        aria-invalid={cellErr ? true : undefined}
                        className={inputClass}
                      >
                        <option value="">— None —</option>
                        {(c.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.title}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={cellId}
                        type="text"
                        value={row[c.name] ?? ''}
                        onChange={(e) => setCell(index, c.name, e.target.value)}
                        aria-invalid={cellErr ? true : undefined}
                        className={inputClass}
                      />
                    )}
                    {cellErr ? (
                      <p
                        role="alert"
                        className="mt-1 text-sm text-red-600 dark:text-red-400"
                      >
                        {cellErr}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-300"
      >
        <PlusIcon className="h-5 w-5" />
        Add {noun}
      </button>

      {field.description ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {field.description}
        </p>
      ) : null}
    </fieldset>
  )
}
