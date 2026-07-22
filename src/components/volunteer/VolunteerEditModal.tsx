'use client'

import { useState } from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import {
  Occupation,
  TShirtSize,
  type VolunteerWithConference,
} from '@/lib/volunteer/types'

interface VolunteerEditModalProps {
  isOpen: boolean
  onClose: () => void
  volunteer: VolunteerWithConference
}

interface Draft {
  name: string
  email: string
  phone: string
  occupation: Occupation
  availability: string
  preferredTasks: string
  tshirtSize: string
  dietaryRestrictions: string
  otherInfo: string
}

function draftFrom(v: VolunteerWithConference): Draft {
  return {
    name: v.name ?? '',
    email: v.email ?? '',
    phone: v.phone ?? '',
    occupation: v.occupation ?? Occupation.OTHER,
    availability: v.availability ?? '',
    preferredTasks: (v.preferredTasks ?? []).join(', '),
    tshirtSize: v.tshirtSize ?? '',
    dietaryRestrictions: v.dietaryRestrictions ?? '',
    otherInfo: v.otherInfo ?? '',
  }
}

/** Trim to `null` (clear) when empty, else the trimmed value. */
function nullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * SE-4 — organizer edit of a volunteer's own detail fields. Status and review
 * provenance are edited elsewhere and are intentionally absent here.
 */
export function VolunteerEditModal({
  isOpen,
  onClose,
  volunteer,
}: VolunteerEditModalProps) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const [draft, setDraft] = useState<Draft>(() => draftFrom(volunteer))
  const [error, setError] = useState<string | null>(null)

  // Reset the draft whenever a different volunteer is opened.
  const [lastId, setLastId] = useState(volunteer._id)
  if (lastId !== volunteer._id) {
    setLastId(volunteer._id)
    setDraft(draftFrom(volunteer))
    setError(null)
  }

  // Unsaved edits guard the close (ModalShell shows a discard confirm).
  const pristine = draftFrom(volunteer)
  const isDirty = (Object.keys(pristine) as (keyof Draft)[]).some(
    (key) => draft[key] !== pristine[key],
  )

  const updateMutation = api.volunteer.admin.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.volunteer.admin.list.invalidate(),
        utils.volunteer.admin.getById.invalidate({ id: volunteer._id }),
      ])
      showNotification({
        type: 'success',
        title: 'Volunteer updated',
        message: 'The volunteer details were saved.',
      })
      onClose()
    },
    onError: (err) => setError(err.message || 'Failed to update volunteer.'),
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const name = draft.name.trim()
    const email = draft.email.trim()
    const phone = draft.phone.trim()
    if (!name || !email || !phone) {
      setError('Name, email and phone are required.')
      return
    }

    const preferredTasks = draft.preferredTasks
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    updateMutation.mutate({
      volunteerId: volunteer._id,
      name,
      email,
      phone,
      occupation: draft.occupation,
      availability: nullable(draft.availability),
      preferredTasks: preferredTasks.length > 0 ? preferredTasks : null,
      tshirtSize:
        draft.tshirtSize === '' ? null : (draft.tshirtSize as TShirtSize),
      dietaryRestrictions: nullable(draft.dietaryRestrictions),
      otherInfo: nullable(draft.otherInfo),
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Edit volunteer details"
      subtitle={volunteer.name}
      icon={<PencilSquareIcon className="h-5 w-5" />}
      confirmOnDirtyClose
      isDirty={isDirty}
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="vol-name" required>
            <input
              id="vol-name"
              type="text"
              value={draft.name}
              onChange={(e) =>
                setDraft((p) => ({ ...p, name: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Email" htmlFor="vol-email" required>
            <input
              id="vol-email"
              type="email"
              value={draft.email}
              onChange={(e) =>
                setDraft((p) => ({ ...p, email: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Phone" htmlFor="vol-phone" required>
            <input
              id="vol-phone"
              type="tel"
              value={draft.phone}
              onChange={(e) =>
                setDraft((p) => ({ ...p, phone: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Occupation" htmlFor="vol-occupation" required>
            <select
              id="vol-occupation"
              value={draft.occupation}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  occupation: e.target.value as Occupation,
                }))
              }
              className={inputClass}
            >
              {Object.values(Occupation).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="T-shirt size" htmlFor="vol-tshirt">
            <select
              id="vol-tshirt"
              value={draft.tshirtSize}
              onChange={(e) =>
                setDraft((p) => ({ ...p, tshirtSize: e.target.value }))
              }
              className={inputClass}
            >
              <option value="">Not set</option>
              {Object.values(TShirtSize).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Availability" htmlFor="vol-availability">
          <textarea
            id="vol-availability"
            rows={2}
            value={draft.availability}
            onChange={(e) =>
              setDraft((p) => ({ ...p, availability: e.target.value }))
            }
            className={inputClass}
          />
        </Field>

        <Field label="Preferred tasks (comma-separated)" htmlFor="vol-tasks">
          <input
            id="vol-tasks"
            type="text"
            value={draft.preferredTasks}
            onChange={(e) =>
              setDraft((p) => ({ ...p, preferredTasks: e.target.value }))
            }
            placeholder="e.g. registration, catering"
            className={inputClass}
          />
        </Field>

        <Field label="Dietary restrictions" htmlFor="vol-dietary">
          <textarea
            id="vol-dietary"
            rows={2}
            value={draft.dietaryRestrictions}
            onChange={(e) =>
              setDraft((p) => ({ ...p, dietaryRestrictions: e.target.value }))
            }
            className={inputClass}
          />
        </Field>

        <Field label="Other information" htmlFor="vol-other">
          <textarea
            id="vol-other"
            rows={2}
            value={draft.otherInfo}
            onChange={(e) =>
              setDraft((p) => ({ ...p, otherInfo: e.target.value }))
            }
            className={inputClass}
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <AdminButton
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={updateMutation.isPending}
            className="min-h-[44px]"
          >
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            color="blue"
            size="md"
            disabled={updateMutation.isPending}
            className="min-h-[44px]"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}

const inputClass =
  'block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
    </div>
  )
}
