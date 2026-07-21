'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UpdateBanner } from './UpdateBanner'

// How long to wait for `controllerchange` after `SKIP_WAITING` before forcing a
// reload ourselves, so the "Updating…" spinner can never hang forever.
const RELOAD_FALLBACK_MS = 4000
// After we call reload(), a `beforeunload` prompt (e.g. unsaved schedule edits)
// can cancel the navigation and leave us on the page. If we're still here this
// long after, treat the reload as canceled and re-arm the banner so it isn't
// stuck showing a dead spinner. Only ever fires on cancel — a committed reload
// unloads the page before it can.
const RELOAD_CANCEL_RECOVERY_MS = 500

/**
 * Registers the service worker and drives the update lifecycle.
 *
 * Mounted once in the root layout. It:
 *
 *  1. Registers `/sw.js` (stable URL, `updateViaCache: 'none'` so the browser
 *     always revalidates the worker script — paired with the `no-cache` header
 *     set in `next.config.ts`).
 *  2. Detects a genuine UPDATE (not the first install) by watching a newly
 *     `installing` worker reach the `installed` state WHILE a controller already
 *     exists, and surfaces the "new version available" banner.
 *  3. On the user clicking Reload, posts `SKIP_WAITING` to the waiting worker.
 *  4. Reloads the page EXACTLY ONCE on `controllerchange`, guarded by a
 *     `refreshing` flag so the swap can never spiral into a reload loop.
 *  5. Calls `registration.update()` on focus / visibility change so long-lived
 *     tabs pick up a deploy without a manual refresh.
 *
 * Registration happens only in the browser and only in production builds, so it
 * never fights Turbopack HMR during `next dev`.
 */
export function ServiceWorkerRegistrar() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  // True from the moment the user clicks Reload until the page actually reloads.
  // Drives the banner's in-progress ("Installing…") state.
  const [updating, setUpdating] = useState(false)
  // The worker that is installed and waiting to activate.
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)
  // Set only when the USER accepts the update (clicks Reload). Gates the
  // controllerchange reload so a first-install `clients.claim()` — which also
  // fires controllerchange — never triggers an unsolicited page reload.
  const reloadRequestedRef = useRef(false)
  // Shared "already reloading" guard so the controllerchange handler AND the
  // fallback timeout reload the page EXACTLY ONCE, whichever fires first.
  const refreshingRef = useRef(false)
  // Id of the fallback timeout that forces a reload if controllerchange never
  // arrives. Stored in a ref so both paths (and cleanup) can clear it.
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Id of the post-reload recovery timeout (see RELOAD_CANCEL_RECOVERY_MS).
  const recoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reload the page exactly once. Clears any pending fallback timeout so the
  // other path can no longer fire a second reload. Both the controllerchange
  // handler and the fallback timeout funnel through here.
  const doReload = useCallback(() => {
    if (fallbackTimeoutRef.current !== null) {
      clearTimeout(fallbackTimeoutRef.current)
      fallbackTimeoutRef.current = null
    }
    if (refreshingRef.current) return
    refreshingRef.current = true
    window.location.reload()
    // Execution only resumes here if the reload was CANCELED by a beforeunload
    // prompt (a committed reload unloads the page first). Re-arm so the banner
    // recovers from its disabled "Updating…" state and the user can retry.
    recoveryTimeoutRef.current = setTimeout(() => {
      refreshingRef.current = false
      reloadRequestedRef.current = false
      setUpdating(false)
    }, RELOAD_CANCEL_RECOVERY_MS)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Registering the SW under Turbopack HMR fights dev reloads; prod only.
    if (process.env.NODE_ENV !== 'production') return

    // Reload exactly once when the active worker changes AFTER the user accepted
    // the update. `doReload`'s `refreshingRef` guard prevents an infinite loop
    // (and coordinates with the fallback timeout); the `reloadRequestedRef`
    // guard prevents an unsolicited reload on first install (where
    // `clients.claim()` also fires controllerchange).
    const onControllerChange = () => {
      if (!reloadRequestedRef.current) return
      doReload()
    }
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange,
    )

    let registration: ServiceWorkerRegistration | undefined

    const trackInstalling = (worker: ServiceWorker) => {
      worker.addEventListener('statechange', () => {
        if (
          worker.state === 'installed' &&
          // A non-null controller means this page is already controlled by an
          // older worker ⇒ this is an UPDATE, not the first install.
          navigator.serviceWorker.controller
        ) {
          waitingWorkerRef.current = worker
          setUpdateAvailable(true)
        }
      })
    }

    const onFocusOrVisible = () => {
      if (document.visibilityState !== 'visible') return
      // Ask the browser to re-check `/sw.js` so long-lived tabs notice deploys.
      registration?.update().catch(() => {})
    }

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        })

        // A worker already installing at registration time is an update.
        if (registration.installing) {
          trackInstalling(registration.installing)
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration?.installing
          if (installing) trackInstalling(installing)
        })

        window.addEventListener('focus', onFocusOrVisible)
        document.addEventListener('visibilitychange', onFocusOrVisible)
      } catch {
        // Registration failing (unsupported / blocked) is non-fatal.
      }
    }

    // Register after load so it never contends with initial page rendering.
    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }

    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      )
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
      window.removeEventListener('load', register)
      if (fallbackTimeoutRef.current !== null) {
        clearTimeout(fallbackTimeoutRef.current)
        fallbackTimeoutRef.current = null
      }
      if (recoveryTimeoutRef.current !== null) {
        clearTimeout(recoveryTimeoutRef.current)
        recoveryTimeoutRef.current = null
      }
    }
  }, [doReload])

  const handleReload = () => {
    // Ignore repeat clicks (e.g. a rapid double-tap before the button's disabled
    // state renders) so we never post SKIP_WAITING or arm the fallback twice.
    if (reloadRequestedRef.current) return
    // Show the in-progress state immediately so the click has visible feedback
    // even before the worker activates.
    setUpdating(true)
    // Mark the reload as user-accepted so the controllerchange handler is
    // allowed to reload (an unsolicited first-install controllerchange is not).
    reloadRequestedRef.current = true
    const worker = waitingWorkerRef.current
    if (worker) {
      // Tell the waiting worker to activate; `controllerchange` then reloads.
      worker.postMessage({ type: 'SKIP_WAITING' })
      // Fallback: if `controllerchange` never fires (worker wedged, activation
      // stalled), force a reload so the spinner always resolves. `doReload`
      // coordinates with the controllerchange path so we reload exactly once.
      fallbackTimeoutRef.current = setTimeout(doReload, RELOAD_FALLBACK_MS)
    } else {
      // No tracked worker (edge case) — a plain reload still recovers.
      doReload()
    }
  }

  const handleDismiss = () => {
    // Keep the current (waiting) version for now. The already-installed worker
    // stays in `waiting`; the user gets it on their next manual reload / tab
    // close, or when the NEXT deploy installs a newer worker (which re-fires the
    // banner). `update()` alone will NOT re-surface the banner for this same
    // waiting version, since an already-`installed` worker doesn't re-emit.
    setUpdateAvailable(false)
  }

  if (!updateAvailable) return null

  return (
    <UpdateBanner
      onReload={handleReload}
      onDismiss={handleDismiss}
      pending={updating}
    />
  )
}
