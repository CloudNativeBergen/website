'use client'

import { useEffect } from 'react'
import { screenErrorReloads } from '@/components/pwa/screen-update'
import { isScreenModePath } from '@/lib/photo-wall/screen'

/**
 * Screen Mode's error boundary (Photo Wall spec §9.2). A read that fails
 * while the page renders (`requirePhotoWall()`, `readScreenPage()`) can
 * surface after the response has streamed a 200, past the service worker's
 * 5xx fallback, and the screen never mounts to poll. Nobody is there to
 * press a button: it reloads by itself, waiting 10 s, doubling to 5
 * minutes across reloads (`screenErrorReloads`, cleared once the screen
 * renders). A reload that cannot reach the server lands on the offline page,
 * which retries too. Only on `/wall/screen`: should this boundary ever cover
 * another page, that page keeps a plain error.
 */
export function ScreenError({
  error,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('Screen Mode failed to render', error)
    if (!isScreenModePath(window.location.pathname)) return
    // This failure counts: the wait grows with each in a row.
    screenErrorReloads.record(Date.now())
    const timer = setTimeout(
      () => window.location.reload(),
      screenErrorReloads.wait(Date.now()),
    )
    return () => clearTimeout(timer)
  }, [error])
  return (
    <div className="dark fixed inset-0 grid place-items-center bg-stone-950 text-white">
      <p className="font-caveat text-6xl text-white/80">
        The wall will be back in a moment.
      </p>
    </div>
  )
}
