'use client'

import { XMarkIcon } from '@heroicons/react/24/outline'

/**
 * Versioned localStorage key for the dismissal (house pattern, see
 * `InviteReviewersPrompt`). Admin runs on the tenant's own host, so the key is
 * per conference and per browser.
 */
export const SPONSORS_WAITING_HINT_KEY = 'cndn.sponsorsWaitingHint.v1'

interface SponsorsWaitingHintProps {
  onAdd: () => void
  onDismiss: () => void
}

/**
 * One-time nudge for organizers whose saved layout predates the
 * "Sponsors waiting on you" card. The dashboard decides when to show it.
 */
export function SponsorsWaitingHint({
  onAdd,
  onDismiss,
}: SponsorsWaitingHintProps) {
  return (
    <section
      aria-labelledby="sponsors-waiting-hint-heading"
      className="relative mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 py-2 pr-12 pl-4 dark:border-blue-400/30 dark:bg-blue-400/10"
    >
      <p
        id="sponsors-waiting-hint-heading"
        className="text-sm text-gray-800 dark:text-gray-200"
      >
        <span className="font-semibold">New: Sponsors waiting on you.</span> A
        card with your most urgent sponsor actions.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
      >
        Add to dashboard
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-1/2 right-1 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200"
      >
        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    </section>
  )
}
