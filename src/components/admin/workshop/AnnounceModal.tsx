'use client'

import { useState } from 'react'
import {
  MegaphoneIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { formatDateTimeSafe } from '@/lib/time'
import type { WorkshopAnnouncementView } from '@/lib/workshop/announcements'

const MAX_BODY_LENGTH = 2000

interface AnnounceModalProps {
  isOpen: boolean
  onClose: () => void
  workshopTitle: string
  /** Confirmed participant count shown to the author before they broadcast. */
  confirmedCount: number
  onSubmit: (body: string) => void
  isSubmitting?: boolean
  /** Previously-sent announcements for this workshop, newest first (SE-4). */
  announcements?: WorkshopAnnouncementView[]
  /** Save an edited announcement body (no re-email). */
  onEditAnnouncement?: (announcementId: string, body: string) => void
  /** Request deletion of an announcement (parent opens a ConfirmationModal). */
  onDeleteAnnouncement?: (announcement: WorkshopAnnouncementView) => void
  /** True while an edit is in flight (disables the inline editor's Save). */
  isEditingAnnouncement?: boolean
}

/**
 * Compose + send a one-way broadcast announcement to a workshop's CONFIRMED
 * participants, and manage previously-sent announcements (SE-4). The author
 * sees exactly how many people will be emailed before sending. Deliberately no
 * recipient list / no reply UI — this is a broadcast.
 *
 * Editing an announcement corrects the persisted copy ONLY — it does NOT
 * re-email participants (the original was already sent).
 */
export function AnnounceModal({
  isOpen,
  onClose,
  workshopTitle,
  confirmedCount,
  onSubmit,
  isSubmitting = false,
  announcements = [],
  onEditAnnouncement,
  onDeleteAnnouncement,
  isEditingAnnouncement = false,
}: AnnounceModalProps) {
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  // Reset local state whenever the modal transitions open (React-blessed
  // "reset on prop change" so a previous draft never lingers).
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setBody('')
      setEditingId(null)
      setEditBody('')
    }
  }

  const trimmed = body.trim()
  const overLimit = body.length > MAX_BODY_LENGTH
  const canSend = trimmed.length > 0 && !overLimit && !isSubmitting

  const handleSubmit = () => {
    if (!canSend) return
    onSubmit(trimmed)
  }

  const startEdit = (announcement: WorkshopAnnouncementView) => {
    setEditingId(announcement._id)
    setEditBody(announcement.body)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditBody('')
  }

  const saveEdit = (announcementId: string) => {
    const next = editBody.trim()
    if (next.length === 0 || next.length > MAX_BODY_LENGTH) return
    onEditAnnouncement?.(announcementId, next)
    cancelEdit()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Announce to participants"
      subtitle={workshopTitle}
      icon={<MegaphoneIcon className="h-5 w-5" />}
      confirmOnDirtyClose
      isDirty={trimmed.length > 0 && !isSubmitting}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          Will email{' '}
          <strong>
            {confirmedCount} confirmed participant
            {confirmedCount === 1 ? '' : 's'}
          </strong>{' '}
          and post to the workshop page. This is a one-way broadcast —
          participants cannot reply.
        </div>

        <div>
          <label
            htmlFor="workshop-announcement-body"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Message
          </label>
          <textarea
            id="workshop-announcement-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={MAX_BODY_LENGTH}
            placeholder="Share prerequisites, room changes, or any update your participants need to know…"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <div className="mt-1 flex justify-end">
            <span
              className={`text-xs ${
                overLimit
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {body.length}/{MAX_BODY_LENGTH}
            </span>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <AdminButton
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px]"
          >
            Cancel
          </AdminButton>
          <AdminButton
            color="blue"
            size="md"
            onClick={handleSubmit}
            disabled={!canSend}
            className="min-h-[44px]"
          >
            {isSubmitting
              ? 'Sending…'
              : `Send to ${confirmedCount} participant${confirmedCount === 1 ? '' : 's'}`}
          </AdminButton>
        </div>

        {announcements.length > 0 && (
          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
              Sent announcements
            </h3>
            <ul className="space-y-3">
              {announcements.map((announcement) => {
                const isEditing = editingId === announcement._id
                const nextBody = editBody.trim()
                const canSave =
                  nextBody.length > 0 &&
                  nextBody.length <= MAX_BODY_LENGTH &&
                  !isEditingAnnouncement
                return (
                  <li
                    key={announcement._id}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={4}
                          maxLength={MAX_BODY_LENGTH}
                          aria-label="Edit announcement message"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                        <div className="flex justify-end gap-2">
                          <AdminButton
                            variant="secondary"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={isEditingAnnouncement}
                            className="min-h-[44px]"
                          >
                            Cancel
                          </AdminButton>
                          <AdminButton
                            color="blue"
                            size="sm"
                            onClick={() => saveEdit(announcement._id)}
                            disabled={!canSave}
                            className="min-h-[44px]"
                          >
                            {isEditingAnnouncement ? 'Saving…' : 'Save'}
                          </AdminButton>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                            {announcement.body}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {formatDateTimeSafe(announcement.createdAt)}
                            {announcement.authorName
                              ? ` · ${announcement.authorName}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(announcement)}
                            aria-label="Edit announcement"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAnnouncement?.(announcement)}
                            aria-label="Delete announcement"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
