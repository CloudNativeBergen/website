'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/** Chromium's non-standard install-prompt event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * How the app can be installed on the current client:
 * - `chromium` — a `beforeinstallprompt` event was captured and a native
 *   install prompt can be triggered on demand.
 * - `ios` — iOS Safari, which has no install-prompt API; the user must be
 *   guided through the Add-to-Home-Screen flow instead.
 * - `null` — install is not currently available (already installed, or the
 *   browser has not offered it).
 */
export type InstallPlatform = 'chromium' | 'ios' | null

interface PwaInstallContextValue {
  /** The install path available on this client, or `null` when unavailable. */
  platform: InstallPlatform
  /** True when the app is already running as an installed/standalone PWA. */
  isStandalone: boolean
  /** Convenience: an install affordance should be offered. */
  canInstall: boolean
  /**
   * Trigger Chromium's native install prompt. No-op on iOS / when no deferred
   * event is available. The captured event is single-use, so after this
   * resolves {@link platform} returns to `null`.
   */
  promptInstall: () => Promise<void>
  /**
   * iOS only: ask the Add-to-Home-Screen hint banner to appear (used when the
   * user explicitly picks "Install app" from a menu, even if they previously
   * dismissed the automatic banner).
   */
  requestHint: () => void
  /** True while an iOS A2HS hint has been explicitly requested. */
  hintRequested: boolean
  /** Clear a previously requested iOS hint. */
  clearHint: () => void
}

const noop = () => {}

const defaultValue: PwaInstallContextValue = {
  platform: null,
  isStandalone: false,
  canInstall: false,
  promptInstall: async () => {},
  requestHint: noop,
  hintRequested: false,
  clearHint: noop,
}

const PwaInstallContext = createContext<PwaInstallContextValue>(defaultValue)

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes standalone on navigator rather than via display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ masquerades as desktop Safari; disambiguate via touch.
    (/macintosh/i.test(ua) && 'ontouchend' in document)
  )
}

/**
 * App-wide owner of the PWA install capability. Captures Chromium's
 * `beforeinstallprompt` event exactly once and exposes it (plus iOS/standalone
 * detection) through {@link usePwaInstall} so multiple surfaces — the automatic
 * install banner and the user-menu "Install app" item — can share a single
 * source of truth without each re-registering the event listener.
 */
export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<InstallPlatform>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [hintRequested, setHintRequested] = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (detectStandalone()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only capability detection
      setIsStandalone(true)
      return
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress Chromium's default mini-infobar; drive install from our UI.
      event.preventDefault()
      deferredRef.current = event as BeforeInstallPromptEvent
      setPlatform('chromium')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    const onAppInstalled = () => {
      deferredRef.current = null
      setPlatform(null)
      setIsStandalone(true)
    }
    window.addEventListener('appinstalled', onAppInstalled)

    if (detectIOS()) {
      // One-time, client-only capability detection on mount (iOS Safari has no
      // `beforeinstallprompt`). The single extra render is intentional.
      setPlatform((current) => current ?? 'ios')
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    const event = deferredRef.current
    if (!event) return
    await event.prompt()
    try {
      await event.userChoice
    } catch {
      // user choice unavailable — hide regardless
    }
    // The deferred event is single-use; drop it so the affordance disappears.
    deferredRef.current = null
    setPlatform(null)
  }, [])

  const requestHint = useCallback(() => setHintRequested(true), [])
  const clearHint = useCallback(() => setHintRequested(false), [])

  const value: PwaInstallContextValue = {
    platform,
    isStandalone,
    canInstall: platform !== null && !isStandalone,
    promptInstall,
    requestHint,
    hintRequested,
    clearHint,
  }

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  )
}

/**
 * Read the shared PWA install capability. Safe to call without a
 * {@link PwaInstallProvider} in the tree — it then reports "not installable"
 * and its actions are no-ops (handy for Storybook and unit tests).
 */
export function usePwaInstall(): PwaInstallContextValue {
  return useContext(PwaInstallContext)
}
