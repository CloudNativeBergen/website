'use client'

import { Logo } from '@/components/Logo'

/**
 * Offline fallback page.
 *
 * The service worker precaches this route and serves it for a document
 * navigation ONLY when the network is unreachable. It is deliberately:
 *
 *  - NOT under any authenticated route group (`(cfp)`/`(admin)`/`(stream)`), so
 *    it carries no per-user content and is safe to cache and serve to anyone.
 *  - Fully static and self-contained (no `headers()`, no data fetching), so it
 *    prerenders to cacheable HTML that never goes stale in a harmful way.
 *
 * `metadata` is intentionally omitted here so the route inherits the root
 * layout's title template.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center px-6 py-20 text-center">
      <Logo className="h-12 w-auto" aria-hidden="true" />

      <h1 className="font-display mt-10 text-3xl font-medium tracking-tighter text-blue-600 sm:text-4xl dark:text-blue-300">
        You&apos;re offline
      </h1>

      <p className="mt-4 max-w-md text-lg tracking-tight text-blue-900 dark:text-blue-100">
        We couldn&apos;t reach the network. Check your connection and try again
        — pages you&apos;ve already visited may still work.
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-8 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-cloud-blue-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue"
      >
        Try again
      </button>
    </div>
  )
}
