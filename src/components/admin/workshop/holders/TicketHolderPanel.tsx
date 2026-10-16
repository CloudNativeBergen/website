'use client'

import { useRef, useState } from 'react'
import {
  ExclamationTriangleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { StatCard } from '@/components/admin/stats'
import { FlaggedSignupsModal } from './FlaggedSignupsModal'
import type { FlaggedPerson } from '@/lib/workshop/holders'
import type { TicketHolderView } from './view'

const HEADING_ID = 'ticket-holders-heading'

const LABELS = [
  'Holders',
  'Confirmed',
  'Waitlist only',
  'Not signed up',
  'Flagged',
] as const

/**
 * "Ticket holders" on `/admin/workshops` (#1333, spec §4): the people who hold
 * a ticket that grants workshop access, and how many of them have signed up.
 * People, by email, where the totals above count sign-ups.
 *
 * Read after the page: the numbers say they are coming, and a read that
 * failed says the numbers are unavailable. Never a zero it does not know.
 */
export function TicketHolderPanel({
  view,
  onRetry,
  onMoveToWaitlist,
  onDeleteSignup,
  isMoving,
  isDeleting,
  isRefreshing,
}: {
  view: TicketHolderView
  onRetry: () => void
  onMoveToWaitlist: (signupId: string, userName: string) => void
  onDeleteSignup: (signupId: string, userName: string) => void
  isMoving?: boolean
  isDeleting?: boolean
  /**
   * The numbers are being read again (after an action, or a save). The list
   * still shows what the last read said, so it offers no action until the
   * new read is in.
   */
  isRefreshing?: boolean
}) {
  const [flaggedOpen, setFlaggedOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  /** The Flagged button is a button only while somebody is flagged. */
  const openerGone = view.state !== 'ready' || view.stats.flagged.length === 0

  // THE LIST LIVES ONLY WHILE THE NUMBERS DO. When a refresh fails with it
  // open, it closes (and focus goes to the heading, below), and the next good
  // read does not open it again by itself. The last list read stays in it
  // while it closes, so it does not empty before it fades.
  const flagged = view.state === 'ready' ? view.stats.flagged : null
  const [shown, setShown] = useState<FlaggedPerson[]>([])
  if (flagged && flagged !== shown) setShown(flagged)
  if (!flagged && flaggedOpen) setFlaggedOpen(false)

  return (
    <section
      aria-labelledby={HEADING_ID}
      className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
    >
      <div className="flex items-center gap-2">
        <UserGroupIcon className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />
        <h3
          ref={heading}
          id={HEADING_ID}
          // Focusable from code only: focus lands here when the button that
          // opened the flagged list has left the page (its last person went).
          tabIndex={-1}
          className="text-lg font-medium text-gray-900 outline-none dark:text-white"
        >
          Ticket holders
        </h3>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        People holding a ticket that grants workshop access, counted once each
        by email.
        {view.state === 'ready' &&
          !view.stats.configured &&
          ' No ticket type is set yet, so the built-in list decides who holds one, as it does at sign-up.'}
      </p>

      {view.state === 'loading' && (
        <>
          <p className="sr-only" role="status">
            Reading the ticket holders…
          </p>
          <div
            aria-hidden
            className="mt-4 grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5"
          >
            {LABELS.map((label) => (
              <div
                key={label}
                className="h-[4.25rem] rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
              />
            ))}
          </div>
        </>
      )}

      {view.state === 'unavailable' && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900"
        >
          <p className="flex min-w-0 flex-1 basis-60 items-start gap-1.5">
            <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              Unavailable: who holds a workshop ticket cannot be told right now.
              The sign-up totals above are not affected.
            </span>
          </p>
          <button
            type="button"
            // A second press would cancel the read on its way and start it
            // over, so a slow provider would never get to answer.
            onClick={() => {
              if (!view.retrying) onRetry()
            }}
            // Not `disabled`, which would drop the focus the press left here.
            aria-disabled={view.retrying}
            className="min-h-11 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
          >
            {view.retrying ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      )}

      {view.state === 'ready' && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            <StatCard
              label="Holders"
              value={view.stats.holders}
              subtitle="Hold a workshop ticket"
            />
            <StatCard
              label="Confirmed"
              value={view.stats.confirmed}
              color="green"
              subtitle="Have a seat"
            />
            <StatCard
              label="Waitlist only"
              value={view.stats.waitlistOnly}
              color="blue"
              subtitle="Waiting, no seat"
            />
            <StatCard
              label="Not signed up"
              value={view.stats.notSignedUp}
              color="yellow"
              subtitle="No sign-up yet"
            />
            <StatCard
              // A row of its own on a phone, where the others pair up.
              className="col-span-2 sm:col-span-1"
              label="Flagged"
              value={view.stats.flagged.length}
              color={view.stats.flagged.length > 0 ? 'red' : 'slate'}
              subtitle={
                view.stats.flagged.length > 0
                  ? 'No workshop ticket · Review'
                  : 'No workshop ticket'
              }
              onClick={
                view.stats.flagged.length > 0
                  ? () => setFlaggedOpen(true)
                  : undefined
              }
            />
          </div>
        </>
      )}

      <FlaggedSignupsModal
        isOpen={flaggedOpen}
        onClose={() => setFlaggedOpen(false)}
        afterLeave={() => {
          if (openerGone) heading.current?.focus()
        }}
        people={flagged ?? shown}
        onMoveToWaitlist={onMoveToWaitlist}
        onDeleteSignup={onDeleteSignup}
        isMoving={isMoving}
        isDeleting={isDeleting}
        isRefreshing={isRefreshing}
      />
    </section>
  )
}
