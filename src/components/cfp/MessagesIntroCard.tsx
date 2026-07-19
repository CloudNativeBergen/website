'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/react/24/outline'

/**
 * Versioned localStorage key for the dismissal. Bump the suffix to re-surface the
 * card after a materially new messaging capability ships (a dismissed `v1` should
 * NOT silently hide a future `v2` announcement).
 */
export const MESSAGES_INTRO_DISMISS_KEY = 'cndn.messagesIntro.v1'

interface MessagesIntroCardProps {
  /**
   * Test/story seam: skip the localStorage read and force the visible state.
   * Omit in the app so real dismissal persistence is used.
   */
  forceVisible?: boolean
}

/**
 * A dismissible adoption card for the speaker dashboard (V2d) announcing the
 * speaker↔organizer Messages feature. Mounted only on `/cfp/list`, which already
 * requires a signed-in speaker, so it inherently renders for signed-in speakers
 * only. Dismissal persists in localStorage under {@link MESSAGES_INTRO_DISMISS_KEY}.
 *
 * Renders nothing until the dismissal state is known (avoids a flash of the card
 * for someone who already dismissed it, and any SSR/hydration mismatch).
 */
export function MessagesIntroCard({ forceVisible }: MessagesIntroCardProps) {
  const [visible, setVisible] = useState<boolean | null>(
    forceVisible === undefined ? null : forceVisible,
  )

  useEffect(() => {
    if (forceVisible !== undefined) return
    try {
      const dismissed =
        window.localStorage.getItem(MESSAGES_INTRO_DISMISS_KEY) === 'true'
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; the visible state can only be resolved after mount.
      setVisible(!dismissed)
    } catch {
      // Private mode / storage disabled: show the card rather than suppress it.
      setVisible(true)
    }
  }, [forceVisible])

  const dismiss = () => {
    setVisible(false)
    if (forceVisible !== undefined) return
    try {
      window.localStorage.setItem(MESSAGES_INTRO_DISMISS_KEY, 'true')
    } catch {
      // Best-effort: the card stays hidden for this session even if we can't
      // persist the choice.
    }
  }

  if (!visible) return null

  return (
    <section
      aria-labelledby="messages-intro-heading"
      className="relative overflow-hidden rounded-lg border border-brand-cloud-blue/30 bg-brand-cloud-blue/5 p-5 dark:border-blue-400/30 dark:bg-blue-400/10"
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
        <ChatBubbleLeftRightIcon
          className="h-6 w-6 shrink-0 text-brand-cloud-blue dark:text-blue-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3
            id="messages-intro-heading"
            className="font-space-grotesk text-base font-semibold text-gray-900 dark:text-white"
          >
            New: Messages &mdash; contact the organizers directly
          </h3>
          <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-300">
            Ask questions about your proposal or logistics and get replies in
            the app, by email, and as push &mdash; no more chasing CC&apos;d
            emails.
          </p>
          <Link
            href="/cfp/messages"
            className="font-space-grotesk mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-cloud-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue/90 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <ChatBubbleLeftRightIcon className="h-4 w-4" aria-hidden="true" />
            Open Messages
          </Link>
        </div>
      </div>
    </section>
  )
}
