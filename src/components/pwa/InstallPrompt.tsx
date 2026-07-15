'use client'

import { useEffect, useRef, useState } from 'react'
import { InstallBanner } from './InstallBanner'

/** Chromium's non-standard install-prompt event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes standalone on navigator rather than via display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ masquerades as desktop Safari; disambiguate via touch.
    (/macintosh/i.test(ua) && 'ontouchend' in document)
  )
}

/**
 * Install affordance controller. Captures Chromium's `beforeinstallprompt` and
 * surfaces an actionable Install button; on iOS Safari (which has no such
 * event) it shows an Add-to-Home-Screen hint instead. Nothing renders when the
 * app is already installed/standalone or the user has dismissed it once — it
 * never nags.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<'chromium' | 'ios' | null>(null)
  const promptEventRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      if (localStorage.getItem(DISMISS_KEY)) return
    } catch {
      // localStorage unavailable (private mode) — proceed without persistence.
    }

    if (isStandalone()) return

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress Chromium's default mini-infobar; drive install from our UI.
      event.preventDefault()
      promptEventRef.current = event as BeforeInstallPromptEvent
      setMode('chromium')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    const onAppInstalled = () => {
      promptEventRef.current = null
      setMode(null)
    }
    window.addEventListener('appinstalled', onAppInstalled)

    if (isIOS()) {
      // One-time, client-only capability detection on mount (iOS Safari has no
      // `beforeinstallprompt`). The single extra render is intentional and only
      // happens for iOS visitors who have not dismissed the hint.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only detection
      setMode((current) => current ?? 'ios')
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore persistence failures
    }
    setMode(null)
  }

  const handleInstall = async () => {
    const event = promptEventRef.current
    if (!event) return
    await event.prompt()
    try {
      await event.userChoice
    } catch {
      // user choice unavailable — hide regardless
    }
    promptEventRef.current = null
    setMode(null)
  }

  if (!mode) return null

  return (
    <InstallBanner
      mode={mode}
      onInstall={handleInstall}
      onDismiss={handleDismiss}
    />
  )
}
