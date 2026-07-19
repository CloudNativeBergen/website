'use client'

import { useState } from 'react'
import { MegaphoneIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'

const MAX_BODY_LENGTH = 2000

interface AnnounceModalProps {
  isOpen: boolean
  onClose: () => void
  workshopTitle: string
  /** Confirmed participant count shown to the author before they broadcast. */
  confirmedCount: number
  onSubmit: (body: string) => void
  isSubmitting?: boolean
}

/**
 * Compose + send a one-way broadcast announcement to a workshop's CONFIRMED
 * participants. The author sees exactly how many people will be emailed before
 * sending. Deliberately no recipient list / no reply UI — this is a broadcast.
 */
export function AnnounceModal({
  isOpen,
  onClose,
  workshopTitle,
  confirmedCount,
  onSubmit,
  isSubmitting = false,
}: AnnounceModalProps) {
  const [body, setBody] = useState('')

  // Reset the textarea whenever the modal transitions open (React-blessed
  // "reset on prop change" so a previous draft never lingers).
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) setBody('')
  }

  const trimmed = body.trim()
  const overLimit = body.length > MAX_BODY_LENGTH
  const canSend = trimmed.length > 0 && !overLimit && !isSubmitting

  const handleSubmit = () => {
    if (!canSend) return
    onSubmit(trimmed)
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
      </div>
    </ModalShell>
  )
}
