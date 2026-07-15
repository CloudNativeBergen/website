'use client'

import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline'

export interface InstallBannerProps {
  /**
   * `chromium` shows an actionable Install button (backed by
   * `beforeinstallprompt`); `ios` shows the Add-to-Home-Screen hint since iOS
   * Safari has no install prompt API.
   */
  mode: 'chromium' | 'ios'
  /** Invoked by the Install button (Chromium only). */
  onInstall?: () => void
  /** Invoked by the dismiss control. */
  onDismiss: () => void
}

/**
 * Presentational install affordance: an unobtrusive, dismissible pill anchored
 * to the bottom of the viewport. Kept free of any browser-event logic so it can
 * be rendered standalone in Storybook and unit tests.
 */
export function InstallBanner({
  mode,
  onInstall,
  onDismiss,
}: InstallBannerProps) {
  return (
    <div
      role="dialog"
      aria-label="Install app"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-gray-900/10 dark:bg-gray-800 dark:ring-white/10">
        <div className="flex size-10 flex-none items-center justify-center rounded-xl bg-brand-cloud-blue/10 text-brand-cloud-blue dark:bg-brand-cloud-blue/20">
          <ArrowDownTrayIcon className="size-5" />
        </div>

        <div className="flex-1 text-sm text-gray-700 dark:text-gray-200">
          {mode === 'chromium' ? (
            <span>Install Cloud Native Days for quick, app-like access.</span>
          ) : (
            <span>
              Add to your Home Screen: tap Share, then{' '}
              <span className="font-semibold">Add to Home Screen</span>.
            </span>
          )}
        </div>

        {mode === 'chromium' && (
          <button
            type="button"
            onClick={onInstall}
            className="flex-none rounded-lg bg-brand-cloud-blue px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-cloud-blue-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue"
          >
            Install app
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss install prompt"
          className="flex-none rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <XMarkIcon className="size-5" />
        </button>
      </div>
    </div>
  )
}
