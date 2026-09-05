'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserGroupIcon, XMarkIcon } from '@heroicons/react/24/outline'

/**
 * Versioned localStorage key for the dismissal (the house pattern —
 * `MessagesIntroCard`). Admin runs on the tenant's own host, so the per-origin
 * key is per-conference for free. Bump the suffix only if the invite flow
 * changes enough that re-surfacing is warranted.
 */
export const INVITE_REVIEWERS_DISMISS_KEY = 'cndn.inviteReviewers.v1'

interface InviteReviewersPromptProps {
  /** Current `conference.organizers[]` length, server-derived. */
  organizerCount: number
  /** Number of proposals this conference has received, server-derived. */
  proposalCount: number
  /**
   * Test/story seam: skip the localStorage read and force the visible state.
   * Omit in the app so real dismissal persistence is used. The condition props
   * still gate — a forced-visible prompt for two organizers stays hidden.
   */
  forceVisible?: boolean
}

/**
 * "Invite your reviewers" nudge on `/admin/proposals` (platform#49 phase 2):
 * the first proposal has arrived and the conference still has exactly ONE
 * organizer — review with one account is not review. Renders ONLY in that
 * exact state (organizerCount === 1 AND proposalCount >= 1), links to the
 * organizer section of settings, and persists dismissal in localStorage under
 * {@link INVITE_REVIEWERS_DISMISS_KEY} so it never nags.
 *
 * Renders nothing until the dismissal state is known (no flash for someone who
 * already dismissed it, no SSR/hydration mismatch).
 */
export function InviteReviewersPrompt({
  organizerCount,
  proposalCount,
  forceVisible,
}: InviteReviewersPromptProps) {
  const [visible, setVisible] = useState<boolean | null>(
    forceVisible === undefined ? null : forceVisible,
  )

  useEffect(() => {
    if (forceVisible !== undefined) return
    try {
      const dismissed =
        window.localStorage.getItem(INVITE_REVIEWERS_DISMISS_KEY) === 'true'
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; the visible state can only be resolved after mount.
      setVisible(!dismissed)
    } catch {
      // Private mode / storage disabled: show the prompt rather than suppress it.
      setVisible(true)
    }
  }, [forceVisible])

  // The condition, not the seam, has the last word: never for a conference
  // with a committee already, never before the first proposal.
  if (organizerCount !== 1 || proposalCount < 1) return null
  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    if (forceVisible !== undefined) return
    try {
      window.localStorage.setItem(INVITE_REVIEWERS_DISMISS_KEY, 'true')
    } catch {
      // Best-effort: hidden for this session even if we can't persist.
    }
  }

  return (
    <section
      aria-labelledby="invite-reviewers-heading"
      className="relative mb-4 overflow-hidden rounded-lg border border-brand-cloud-blue/30 bg-brand-cloud-blue/5 p-5 sm:mb-6 dark:border-blue-400/30 dark:bg-blue-400/10"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-1 right-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:hover:bg-gray-700/50 dark:hover:text-gray-200"
      >
        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="flex items-start gap-3 pr-10">
        <UserGroupIcon
          className="h-6 w-6 shrink-0 text-brand-cloud-blue dark:text-blue-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3
            id="invite-reviewers-heading"
            className="font-space-grotesk text-base font-semibold text-gray-900 dark:text-white"
          >
            Your first proposal is in &mdash; invite your reviewers
          </h3>
          <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-300">
            You are the only organizer on this conference. Reviewing with one
            account is not really review &mdash; invite a co-organizer so
            proposals get a second pair of eyes.
          </p>
          <Link
            href="/admin/settings#team-content"
            className="font-space-grotesk mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-cloud-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue/90 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
            Invite co-organizers
          </Link>
        </div>
      </div>
    </section>
  )
}
