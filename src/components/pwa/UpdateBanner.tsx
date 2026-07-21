'use client'

import { useEffect, useState } from 'react'
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'

export interface UpdateBannerProps {
  /** Invoked by the Reload button — triggers activation of the waiting worker. */
  onReload: () => void
  /** Invoked by the dismiss control (keeps the current version for now). */
  onDismiss: () => void
  /**
   * When true the swap is in progress: the leading icon and the Reload button
   * spin, the copy switches to "Installing…", and BOTH actions are disabled
   * (you cannot cancel an activation mid-flight). The parent container owns this
   * flag — the banner itself has no service-worker logic.
   */
  pending?: boolean
}

/**
 * Presentational "new version available" banner. Mirrors {@link InstallBanner}'s
 * anchored, dismissible pill styling so the two PWA affordances feel identical.
 * Kept free of any service-worker logic so it renders standalone in Storybook
 * and unit tests.
 *
 * Motion: a subtle slide/fade entrance driven by a mount flag and core
 * `transition` utilities. The `motion-reduce:` variant disables the transform
 * and transition entirely for users who prefer reduced motion.
 */
export function UpdateBanner({
  onReload,
  onDismiss,
  pending = false,
}: UpdateBannerProps) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    // Defer to the next frame so the transition animates from the initial state.
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      // A banner is NOT a dialog: nothing traps or returns focus, so
      // `role="dialog"` misleads screen readers into announcing a modal.
      // `role="status"` (implicit polite live region) announces it without
      // stealing focus. It also sits BELOW open dialogs (shell family is z-50).
      role="status"
      aria-live="polite"
      aria-busy={pending}
      aria-label="Update available"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div
        className={`flex w-full max-w-md items-center gap-3 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-gray-900/10 transition duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none dark:bg-gray-800 dark:ring-white/10 ${
          entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <div className="flex size-10 flex-none items-center justify-center rounded-xl bg-brand-cloud-blue/10 text-brand-cloud-blue dark:bg-brand-cloud-blue/20">
          <ArrowPathIcon
            className={`size-5 ${
              pending ? 'animate-spin motion-reduce:animate-none' : ''
            }`}
          />
        </div>

        <div className="flex-1 text-sm text-gray-700 dark:text-gray-200">
          <span>
            {pending
              ? 'Installing the new version…'
              : 'A new version is available.'}
          </span>
        </div>

        <button
          type="button"
          onClick={onReload}
          disabled={pending}
          aria-busy={pending}
          className="flex min-h-11 flex-none items-center justify-center gap-1.5 rounded-lg bg-brand-cloud-blue px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-cloud-blue-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-default disabled:opacity-90 disabled:hover:bg-brand-cloud-blue"
        >
          {pending ? (
            <>
              <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" />
              <span>Updating…</span>
            </>
          ) : (
            <span>Reload</span>
          )}
        </button>

        <button
          type="button"
          onClick={onDismiss}
          disabled={pending}
          aria-label="Dismiss update prompt"
          className="flex min-h-11 min-w-11 flex-none items-center justify-center rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <XMarkIcon className="size-5" />
        </button>
      </div>
    </div>
  )
}
