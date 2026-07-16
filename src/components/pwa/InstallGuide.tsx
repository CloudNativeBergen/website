'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowUpOnSquareIcon,
  CheckCircleIcon,
  PlusSmallIcon,
  BoltIcon,
  WifiIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline'
import { usePwaInstall } from './PwaInstallProvider'
import {
  detectBrowser,
  resolveInstallView,
  type InstallView,
} from './installView'

/** Why someone would install — shown above the manual/actionable flows. */
function Benefits() {
  const items = [
    {
      icon: BoltIcon,
      text: 'Launches full-screen, straight from your home screen',
    },
    { icon: WifiIcon, text: 'Works offline — the schedule stays available' },
    {
      icon: DevicePhoneMobileIcon,
      text: 'Enables push notifications for schedule changes (iOS: install first)',
    },
  ]
  return (
    <ul className="mt-6 space-y-3 text-left">
      {items.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-3">
          <Icon
            className="mt-0.5 size-5 flex-none text-brand-cloud-blue"
            aria-hidden="true"
          />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {text}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One numbered step in the iOS Add-to-Home-Screen walkthrough. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-4">
      <span
        className="flex size-8 flex-none items-center justify-center rounded-full bg-brand-cloud-blue/10 text-sm font-bold text-brand-cloud-blue dark:bg-brand-cloud-blue/20"
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="pt-1 text-sm text-gray-700 dark:text-gray-200">
        {children}
      </span>
    </li>
  )
}

export interface InstallGuidePanelProps {
  view: InstallView
  /** Invoked by the Chromium Install button. */
  onInstall?: () => void
}

/**
 * Presentational install guidance for a resolved {@link InstallView}. Free of
 * any browser-event or context access so every state can be rendered directly
 * (Storybook, tests). The container {@link InstallGuide} picks the view.
 */
export function InstallGuidePanel({ view, onInstall }: InstallGuidePanelProps) {
  if (view === 'installed') {
    return (
      <div className="text-center">
        <CheckCircleIcon
          className="mx-auto size-14 text-green-500"
          aria-hidden="true"
        />
        <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          You&rsquo;re all set
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Cloud Native Days is installed. Launch it from your home screen or app
          launcher any time.
        </p>
      </div>
    )
  }

  if (view === 'chromium') {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-cloud-blue/10 text-brand-cloud-blue dark:bg-brand-cloud-blue/20">
          <ArrowDownTrayIcon className="size-7" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          Install the app
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          One tap adds Cloud Native Days to your device.
        </p>
        <button
          type="button"
          onClick={onInstall}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-cloud-blue px-6 py-3 text-base font-semibold text-white transition hover:bg-brand-cloud-blue-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
        >
          <ArrowDownTrayIcon className="size-5" aria-hidden="true" />
          Install Cloud Native Days
        </button>
        <Benefits />
      </div>
    )
  }

  if (view === 'ios-safari') {
    return (
      <div>
        <h2 className="text-center text-xl font-bold text-gray-900 dark:text-white">
          Add to your Home Screen
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
          iOS installs from Safari&rsquo;s Share menu — it only takes three
          taps.
        </p>
        <ol className="mt-6 space-y-4">
          <Step n={1}>
            Tap the{' '}
            <span className="inline-flex items-center gap-1 font-semibold text-gray-900 dark:text-white">
              Share
              <ArrowUpOnSquareIcon
                className="inline size-4 align-text-bottom"
                aria-label="Share"
              />
            </span>{' '}
            icon in the Safari toolbar.
          </Step>
          <Step n={2}>
            Scroll down and choose{' '}
            <span className="inline-flex items-center gap-1 font-semibold text-gray-900 dark:text-white">
              Add to Home Screen
              <PlusSmallIcon
                className="inline size-4 rounded border border-current align-text-bottom"
                aria-hidden="true"
              />
            </span>
            .
          </Step>
          <Step n={3}>
            Tap{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              Add
            </span>{' '}
            in the top-right corner. The app appears on your Home Screen.
          </Step>
        </ol>
        <Benefits />
      </div>
    )
  }

  if (view === 'ios-other') {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <ArrowUpOnSquareIcon className="size-7" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          Open in Safari to install
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          On iPhone and iPad, only <span className="font-semibold">Safari</span>{' '}
          can add apps to your Home Screen. Open this page in Safari, then use
          Share → Add to Home Screen.
        </p>
      </div>
    )
  }

  // desktop-generic
  return (
    <div className="text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-cloud-blue/10 text-brand-cloud-blue dark:bg-brand-cloud-blue/20">
        <ArrowDownTrayIcon className="size-7" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
        Install from your browser
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Look for an <span className="font-semibold">install icon</span> in the
        address bar, or open your browser menu and choose{' '}
        <span className="font-semibold">Install Cloud Native Days</span>.
        Available in Chrome, Edge, and other Chromium browsers.
      </p>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Firefox and desktop Safari don&rsquo;t support installing this app — you
        can still use it in the browser, or install it on your phone.
      </p>
      <Benefits />
    </div>
  )
}

/**
 * The `/install` container: reads the shared install capability from
 * {@link usePwaInstall} (which owns the single `beforeinstallprompt` capture),
 * adds light UA detection for copy only, and renders the matching
 * {@link InstallGuidePanel}. On Chromium the button drives the real deferred
 * prompt; `appinstalled` flips the provider to standalone and this re-renders
 * into the success state automatically.
 */
export function InstallGuide() {
  const { platform, isStandalone, promptInstall } = usePwaInstall()
  const [browser, setBrowser] = useState({ isIOS: false, isSafari: false })

  useEffect(() => {
    // Client-only UA detection (used for copy only); runs once after mount so
    // SSR and the first client render agree on the neutral default.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only capability detection
    setBrowser(detectBrowser())
  }, [])

  const view = resolveInstallView({
    platform,
    isStandalone,
    isIOS: browser.isIOS,
    isSafari: browser.isSafari,
  })

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gray-900/5 sm:p-8 dark:bg-gray-800 dark:ring-white/10">
      <InstallGuidePanel view={view} onInstall={() => void promptInstall()} />
    </div>
  )
}
