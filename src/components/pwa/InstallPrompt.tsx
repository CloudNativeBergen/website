'use client'

import { useEffect, useState } from 'react'
import { InstallBanner } from './InstallBanner'
import { usePwaInstall } from './PwaInstallProvider'

const DISMISS_KEY = 'pwa-install-dismissed'

/**
 * Automatic install affordance. Reads the shared install capability from
 * {@link usePwaInstall} (which owns the `beforeinstallprompt` capture) and
 * surfaces an unobtrusive, dismissible banner: an actionable Install button on
 * Chromium, or an Add-to-Home-Screen hint on iOS Safari. Nothing renders when
 * the app is already installed/standalone or the user has dismissed it once —
 * it never nags. A dismissed banner still reappears when the user explicitly
 * asks for the iOS hint from the account menu (`hintRequested`).
 */
export function InstallPrompt() {
  const { platform, isStandalone, promptInstall, hintRequested, clearHint } =
    usePwaInstall()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only persisted flag
        setDismissed(true)
      }
    } catch {
      // localStorage unavailable (private mode) — proceed without persistence.
    }
  }, [])

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore persistence failures
    }
    setDismissed(true)
    clearHint()
  }

  if (!platform || isStandalone) return null
  if (dismissed && !hintRequested) return null

  return (
    <InstallBanner
      mode={platform}
      onInstall={promptInstall}
      onDismiss={handleDismiss}
    />
  )
}
