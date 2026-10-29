'use client'

import { useState } from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { formatDateTimeSafe } from '@/lib/time'
import { WORKSHOP_REMINDER_NOTE_MAX } from '@/server/schemas/workshop'
import type { TicketHolderView } from './holders/view'

/** Server refusals: each means nothing was sent. */
const REFUSALS = new Set([
  'BAD_REQUEST',
  'PRECONDITION_FAILED',
  'TOO_MANY_REQUESTS',
])

/** The last reminder, as the conference stores it. */
export interface LastWorkshopReminder {
  at: string
  count: number
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

/**
 * "Remind people who haven't signed up" (#1334, spec
 * `docs/WORKSHOP_TICKETS_SPEC.md` §7): emails every workshop ticket holder
 * without a sign-up, with the organizer's optional note.
 *
 * The dialog says how many will receive it (the page's read of the join, the
 * group the server sends to, read again then) and when the last reminder went
 * out. `disabledReason` is decided on the server by the rule the send itself
 * applies (no working link, or registration closed) and shown as text, not a
 * tooltip: a disabled button cannot be focused to reveal one. The server
 * refuses then too, and allows one reminder an hour.
 */
export function WorkshopReminderButton({
  disabledReason,
  recipients,
  lastSent,
}: {
  disabledReason: string | null
  /** The page's read of the ticket holders. */
  recipients: TicketHolderView
  lastSent: LastWorkshopReminder | null
}) {
  const { showNotification } = useNotification()
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
  // What this page has sent since it was rendered, over what it was given.
  const [sentHere, setSentHere] = useState<LastWorkshopReminder | null>(null)
  const last = sentHere ?? lastSent

  const noteLength = note.trim().length
  const noteTooLong = noteLength > WORKSHOP_REMINDER_NOTE_MAX

  const remind = api.workshop.admin.sendReminder.useMutation({
    onSuccess: ({ sent, failed, unconfirmed, sentAt }) => {
      setConfirming(false)
      if (sent > 0) {
        setSentHere({ at: sentAt, count: sent })
        setNote('')
      }
      showNotification(
        sent + failed + unconfirmed === 0
          ? {
              type: 'info',
              title: 'Nothing to send',
              message: 'Every workshop ticket holder has signed up.',
            }
          : unconfirmed > 0
            ? {
                type: 'warning',
                title: 'Some emails could not be confirmed',
                message: `Sent to ${sent}. The email provider did not answer for ${unconfirmed}; they may have arrived${failed > 0 ? `, and ${failed} failed` : ''}. Wait an hour before sending again.`,
              }
            : sent === 0
              ? {
                  type: 'error',
                  title: 'Nothing was sent',
                  message: `All ${failed} emails were rejected. Try again in a few minutes.`,
                }
              : failed === 0
                ? {
                    type: 'success',
                    title: 'Reminder sent',
                    message: `Sent to ${people(sent)} who had not signed up.`,
                  }
                : {
                    type: 'warning',
                    title: 'Reminder partly sent',
                    message: `Sent to ${sent}; ${failed} could not be sent.`,
                  },
      )
    },
    onError: (error) => {
      setConfirming(false)
      showNotification(
        REFUSALS.has(error.data?.code ?? '')
          ? { type: 'error', title: 'Nothing was sent', message: error.message }
          : {
              type: 'error',
              title: 'The reminder did not finish',
              message:
                'Some emails may have been sent. Check with an attendee before trying again.',
            },
      )
    },
  })

  return (
    <div className="flex flex-col items-end gap-1">
      <AdminButton
        variant="secondary"
        disabled={disabledReason !== null || remind.isPending}
        aria-describedby={
          disabledReason ? 'workshop-reminder-reason' : undefined
        }
        onClick={() => setConfirming(true)}
      >
        <EnvelopeIcon className="mr-1.5 inline size-4" />
        Remind people who haven&apos;t signed up
      </AdminButton>
      {disabledReason && (
        <p
          id="workshop-reminder-reason"
          className="max-w-xs text-right text-xs text-gray-500 dark:text-gray-400"
        >
          {disabledReason}
        </p>
      )}
      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remind.mutate({ note })}
        isLoading={remind.isPending}
        confirmDisabled={noteTooLong}
        variant="info"
        title="Remind people who haven't signed up?"
        message="Everyone who holds a workshop ticket and has not signed up gets an email asking them to pick their workshops, with the link to sign up. It can be sent at most once an hour."
        confirmButtonText="Send reminder"
      >
        <dl className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex flex-wrap gap-x-1">
            <dt className="font-medium">Recipients:</dt>
            <dd>
              {recipients.state === 'ready'
                ? `${people(recipients.stats.notSignedUp)}, counted again when you send`
                : recipients.state === 'loading'
                  ? 'Counting…'
                  : 'Could not be counted now; counted again when you send'}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-1">
            <dt className="font-medium">Last reminder:</dt>
            <dd>
              {last
                ? `${formatDateTimeSafe(last.at)}, to ${people(last.count)}`
                : 'No reminder sent yet'}
            </dd>
          </div>
        </dl>
        <label
          htmlFor="workshop-reminder-note"
          className="mt-4 block text-sm font-medium text-gray-900 dark:text-white"
        >
          Note (optional)
        </label>
        <p
          id="workshop-reminder-note-hint"
          className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
        >
          Shown above the standard text, as plain text.
        </p>
        <textarea
          id="workshop-reminder-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          aria-describedby="workshop-reminder-note-hint workshop-reminder-note-count"
          aria-invalid={noteTooLong}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        <p
          id="workshop-reminder-note-count"
          className={`mt-1 text-right text-xs ${
            noteTooLong
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {noteLength.toLocaleString('en-US')} /{' '}
          {WORKSHOP_REMINDER_NOTE_MAX.toLocaleString('en-US')}
          {noteTooLong ? ' — too long' : ''}
        </p>
      </ConfirmationModal>
    </div>
  )
}
