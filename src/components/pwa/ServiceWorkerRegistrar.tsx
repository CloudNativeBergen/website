'use client'

import { useEffect, useRef, useState } from 'react'
import { UpdateBanner } from './UpdateBanner'

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
  // The worker that is installed and waiting to activate.
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Registering the SW under Turbopack HMR fights dev reloads; prod only.
    if (process.env.NODE_ENV !== 'production') return

    // Reload exactly once when the active worker changes (i.e. the new worker
    // took control after SKIP_WAITING). The guard prevents an infinite loop.
    let refreshing = false
    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
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
    }
  }, [])

  const handleReload = () => {
    const worker = waitingWorkerRef.current
    if (worker) {
      // Tell the waiting worker to activate; `controllerchange` then reloads.
      worker.postMessage({ type: 'SKIP_WAITING' })
    } else {
      // No tracked worker (edge case) — a plain reload still recovers.
      window.location.reload()
    }
  }

  const handleDismiss = () => {
    // Keep the current version for now; the banner reappears on the next
    // `update()` check (focus / visibility) while a worker is still waiting.
    setUpdateAvailable(false)
  }

  if (!updateAvailable) return null

  return <UpdateBanner onReload={handleReload} onDismiss={handleDismiss} />
}
