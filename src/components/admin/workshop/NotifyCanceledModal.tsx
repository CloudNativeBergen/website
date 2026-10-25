'use client'

import { useEffect, useState } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { formatDateTimeSafe } from '@/lib/time'

interface NotifyCanceledModalProps {
  isOpen: boolean
  onClose: () => void
  workshopTitle: string
  confirmedCount: number
  waitlistCount: number
  /** When the participants were last told, if ever. */
  lastSentAt?: string | null
  onSubmit: (message: string) => void
  isSubmitting?: boolean
}

const DEFAULT_MESSAGE =
  'We are sorry for the inconvenience. You are welcome to sign up for another workshop while seats remain.'

/**
 * "Notify participants" of a canceled or withdrawn workshop. Everyone still
 * signed up gets the message; the email's first line says whether they had a
 * seat or were on the waitlist.
 */
export function NotifyCanceledModal({
  isOpen,
  onClose,
  workshopTitle,
  confirmedCount,
  waitlistCount,
  lastSentAt,
  onSubmit,
  isSubmitting = false,
}: NotifyCanceledModalProps) {
  const [message, setMessage] = useState(DEFAULT_MESSAGE)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A fresh message each time the dialog opens
    if (isOpen) setMessage(DEFAULT_MESSAGE)
  }, [isOpen])

  const total = confirmedCount + waitlistCount

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Notify participants"
      subtitle={workshopTitle}
      confirmOnDirtyClose
      isDirty={message !== DEFAULT_MESSAGE && !isSubmitting}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Emails {confirmedCount} confirmed and {waitlistCount} waitlisted{' '}
          {total === 1 ? 'person' : 'people'} that this workshop is canceled.
          Confirmed participants are told they had a seat, the waitlist that
          they were waiting.
        </p>

        {lastSentAt && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
          >
            <ExclamationTriangleIcon className="size-5 shrink-0" aria-hidden />
            Already sent {formatDateTimeSafe(lastSentAt)}. Sending again emails
            everyone a second time.
          </p>
        )}

        <div>
          <label
            htmlFor="notify-canceled-message"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Message
          </label>
          <textarea
            id="notify-canceled-message"
            rows={5}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AdminButton
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-11"
          >
            Cancel
          </AdminButton>
          <AdminButton
            color="brand"
            size="md"
            onClick={() => onSubmit(message)}
            disabled={isSubmitting || total === 0}
            className="min-h-11"
          >
            {isSubmitting
              ? 'Sending...'
              : lastSentAt
                ? 'Send again'
                : `Email ${total} ${total === 1 ? 'person' : 'people'}`}
          </AdminButton>
        </div>
      </div>
    </ModalShell>
  )
}
