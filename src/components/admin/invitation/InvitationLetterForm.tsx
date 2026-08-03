'use client'

import { useState } from 'react'
import {
  DocumentArrowDownIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import type {
  InvitationDelivery,
  ParticipantRole,
} from '@/lib/invitation-letter/types'

export interface InvitationLetterFormValues {
  fullName: string
  dateOfBirth: string
  nationality: string
  passportNumber: string
  passportExpiry: string
  email: string
  organization: string
  role: ParticipantRole
  registrationReference: string
  arrivalDate: string
  departureDate: string
  addressedTo: string
  costCoverage: {
    registrationFee: boolean
    travel: boolean
    accommodation: boolean
  }
  signatoryTitle: string
  additionalNotes: string
  delivery: InvitationDelivery
}

export const EMPTY_INVITATION_FORM: InvitationLetterFormValues = {
  fullName: '',
  dateOfBirth: '',
  nationality: '',
  passportNumber: '',
  passportExpiry: '',
  email: '',
  organization: '',
  role: 'attendee',
  registrationReference: '',
  arrivalDate: '',
  departureDate: '',
  addressedTo: '',
  costCoverage: {
    registrationFee: false,
    travel: false,
    accommodation: false,
  },
  signatoryTitle: '',
  additionalNotes: '',
  delivery: 'download',
}

const ROLES: Array<{ value: ParticipantRole; label: string }> = [
  { value: 'attendee', label: 'Attendee' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'sponsor', label: 'Sponsor representative' },
  { value: 'organizer', label: 'Organizer' },
]

const inputClass =
  'mt-1 block w-full rounded-md border-gray-300 bg-white text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white'
const labelClass =
  'block text-xs font-medium text-gray-600 uppercase dark:text-gray-400'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
    </div>
  )
}

interface InvitationLetterFormProps {
  values: InvitationLetterFormValues
  onChange: (values: InvitationLetterFormValues) => void
  onSubmit: () => void
  isSubmitting: boolean
}

export function InvitationLetterForm({
  values,
  onChange,
  onSubmit,
  isSubmitting,
}: InvitationLetterFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const set = <K extends keyof InvitationLetterFormValues>(
    key: K,
    value: InvitationLetterFormValues[K],
  ) => onChange({ ...values, [key]: value })

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {/* The whole point of the design, stated where the data is entered. */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-200">
        <LockClosedIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Passport details are used to render this letter and are then
          discarded. They are never stored and never appear in logs — only the
          applicant&apos;s name, email and the letter reference are kept, so we
          can show that a letter was issued.
        </p>
      </div>

      <fieldset className="space-y-4">
        <legend className="font-space-grotesk text-sm font-semibold text-gray-900 dark:text-white">
          Applicant
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" hint="Exactly as written in the passport">
            <input
              type="text"
              required
              value={values.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              className={inputClass}
              placeholder="e.g. Amina Yusuf"
            />
          </Field>
          <Field label="Nationality">
            <input
              type="text"
              required
              value={values.nationality}
              onChange={(e) => set('nationality', e.target.value)}
              className={inputClass}
              placeholder="e.g. Kenyan"
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              required
              value={values.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Passport number">
            <input
              type="text"
              required
              value={values.passportNumber}
              onChange={(e) => set('passportNumber', e.target.value)}
              className={inputClass}
              placeholder="e.g. A1234567"
            />
          </Field>
          <Field label="Passport valid until" hint="Optional, often requested">
            <input
              type="date"
              value={values.passportExpiry}
              onChange={(e) => set('passportExpiry', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Email" hint="Required to send the letter by email">
            <input
              type="email"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              className={inputClass}
              placeholder="e.g. amina@example.com"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <legend className="font-space-grotesk text-sm font-semibold text-gray-900 dark:text-white">
          Participation
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Participating as">
            <select
              value={values.role}
              onChange={(e) => set('role', e.target.value as ParticipantRole)}
              className={inputClass}
            >
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Registration reference"
            hint="Ticket or order reference, so the claim is checkable"
          >
            <input
              type="text"
              value={values.registrationReference}
              onChange={(e) => set('registrationReference', e.target.value)}
              className={inputClass}
              placeholder="e.g. TICKET-8891"
            />
          </Field>
          <Field label="Arrival">
            <input
              type="date"
              value={values.arrivalDate}
              onChange={(e) => set('arrivalDate', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Departure">
            <input
              type="date"
              value={values.departureDate}
              onChange={(e) => set('departureDate', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        <legend className="font-space-grotesk text-sm font-semibold text-gray-900 dark:text-white">
          Costs covered by the organizer
        </legend>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Whatever is left unticked is stated in the letter as borne by the
          applicant. Consulates read this line closely, so it is always spelled
          out in both directions.
        </p>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ['registrationFee', 'Registration fee'],
              ['travel', 'Travel'],
              ['accommodation', 'Accommodation'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 text-sm text-gray-900 dark:text-white"
            >
              <input
                type="checkbox"
                checked={values.costCoverage[key]}
                onChange={(e) =>
                  set('costCoverage', {
                    ...values.costCoverage,
                    [key]: e.target.checked,
                  })
                }
                className="h-4 w-4 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setShowAdvanced((open) => !open)}
          className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          {showAdvanced ? 'Hide' : 'Show'} addressee, employer and notes
        </button>

        {showAdvanced && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Addressed to"
              hint="Defaults to “To whom it may concern”"
            >
              <input
                type="text"
                value={values.addressedTo}
                onChange={(e) => set('addressedTo', e.target.value)}
                className={inputClass}
                placeholder="e.g. The Embassy of Norway in Nairobi"
              />
            </Field>
            <Field label="Employer / affiliation">
              <input
                type="text"
                value={values.organization}
                onChange={(e) => set('organization', e.target.value)}
                className={inputClass}
                placeholder="e.g. Example Bank Ltd"
              />
            </Field>
            <Field label="Your title" hint="Printed under your signature">
              <input
                type="text"
                value={values.signatoryTitle}
                onChange={(e) => set('signatoryTitle', e.target.value)}
                className={inputClass}
                placeholder="e.g. Conference Chair"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Additional notes">
                <textarea
                  rows={2}
                  value={values.additionalNotes}
                  onChange={(e) => set('additionalNotes', e.target.value)}
                  className={inputClass}
                  placeholder="Anything unusual about this visit"
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
        <div className="flex flex-wrap gap-4">
          {(
            [
              ['download', 'Download only'],
              ['both', 'Download and email'],
              ['email', 'Email only'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 text-sm text-gray-900 dark:text-white"
            >
              <input
                type="radio"
                name="delivery"
                value={value}
                checked={values.delivery === value}
                onChange={() => set('delivery', value)}
                className="h-4 w-4 cursor-pointer border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
              />
              {label}
            </label>
          ))}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-gray-400 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:dark:bg-gray-600"
        >
          {values.delivery === 'download' ? (
            <DocumentArrowDownIcon className="h-4 w-4" />
          ) : (
            <PaperAirplaneIcon className="h-4 w-4" />
          )}
          {isSubmitting ? 'Issuing…' : 'Issue letter'}
        </button>
      </div>
    </form>
  )
}
