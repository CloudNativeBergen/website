'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  TrashIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { SpeakerCombobox } from '@/components/messaging/SpeakerCombobox'
import type { SpeakerOption } from '@/components/messaging/SpeakerCombobox'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import { validateOrganizers } from './editConferenceRefs'

/**
 * SE-2 — the Organizers editor island.
 *
 * `organizers[]` is the CANONICAL organizer definition: it grants `/admin`
 * access and is the notification fan-out audience. Adding someone grants admin;
 * removing someone REVOKES their `/admin` access on their next session refresh.
 *
 * SELF-LOCKOUT: the acting organizer's own row is LOCKED (a lock icon, no remove)
 * so they cannot revoke their own access mid-edit; the server enforces the same
 * guard (BAD_REQUEST) as the authority.
 *
 * Members are added with the shared {@link SpeakerCombobox} (the same
 * `speaker.admin.search` source the messaging composer uses), so no new server
 * search surface is introduced.
 */
export interface OrganizerRow {
  _id: string
  name: string
  /** Resolved avatar URL (from the settings-page projection), if any. */
  image?: string
  title?: string
}

export interface OrganizersEditorProps {
  organizers: OrganizerRow[]
  /** The acting organizer's speaker id — their row is locked. */
  currentUserId: string
  /** Render the modal open on mount — for stories/tests only. */
  defaultOpen?: boolean
}

function Avatar({ name, image }: { name: string; image?: string }) {
  if (image) {
    // A resolved remote avatar URL, not a bundled asset — a plain <img> keeps
    // this small modal row dependency-free (no next/image layout machinery).
    return (
      <img
        src={image}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    )
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-cloud-blue/10 text-xs font-semibold text-brand-cloud-blue dark:bg-brand-cloud-blue/20"
    >
      {initials || '?'}
    </span>
  )
}

export function OrganizersEditor({
  organizers,
  currentUserId,
  defaultOpen = false,
}: OrganizersEditorProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [rows, setRows] = useState<OrganizerRow[]>(organizers)
  const [picked, setPicked] = useState<SpeakerOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const ids = rows.map((r) => r._id)
  const baselineIds = organizers.map((r) => r._id)
  const isDirty = JSON.stringify(ids) !== JSON.stringify(baselineIds)

  const mutation = api.conference.updateOrganizers.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Organizers updated',
        message: 'The organizer team was saved.',
      })
      setIsOpen(false)
    },
    onError: (err) => {
      setSubmitError(err.message || 'Failed to save organizers.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: err.message || 'Failed to save organizers.',
      })
    },
  })

  const reset = () => {
    setRows(organizers)
    setPicked(null)
    setError(null)
    setSubmitError(null)
  }
  const openModal = () => {
    reset()
    setIsOpen(true)
  }
  const closeModal = () => {
    setIsOpen(false)
    reset()
  }

  const addPicked = (speaker: SpeakerOption | null) => {
    setPicked(null)
    if (!speaker) return
    if (rows.some((r) => r._id === speaker._id)) return
    setRows((prev) => [
      ...prev,
      { _id: speaker._id, name: speaker.name, title: speaker.title },
    ])
    setError(null)
  }

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r._id !== id))
    setError(null)
  }

  const handleSave = () => {
    setSubmitError(null)
    const validation = validateOrganizers(ids, currentUserId)
    if (validation) {
      setError(validation)
      return
    }
    mutation.mutate({ organizers: ids })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Edit Organizers"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="lg"
        title="Edit Organizers"
        subtitle="Who has admin access and receives team notifications"
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
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            Organizers get full admin access and receive team notifications.
            Removing someone revokes their <code>/admin</code> access on their
            next session refresh.
          </p>

          <ul className="space-y-2">
            {rows.map((row) => {
              const locked = row._id === currentUserId
              return (
                <li
                  key={row._id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
                >
                  <Avatar name={row.name} image={row.image} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {row.name}
                    </p>
                    {row.title ? (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {row.title}
                      </p>
                    ) : null}
                  </div>
                  {locked ? (
                    <span
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 opacity-70"
                      title="You cannot remove yourself from the organizer team"
                      aria-label={`${row.name} is you and cannot be removed`}
                    >
                      <LockClosedIcon className="h-5 w-5" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeRow(row._id)}
                      aria-label={`Remove ${row.name}`}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          <div>
            <label
              htmlFor="organizer-add"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Add an organizer
            </label>
            <SpeakerCombobox
              id="organizer-add"
              value={picked}
              onChange={addPicked}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
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
              color="blue"
              size="md"
              disabled={mutation.isPending || !isDirty}
              className="min-h-[44px]"
            >
              {mutation.isPending ? 'Saving…' : 'Save organizers'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
