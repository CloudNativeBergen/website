'use client'

/**
 * Browser-side stand-in for `@/hooks/dashboard/useWidgetData`, aliased in
 * `.storybook/main.ts` the same way as `./mock-admin-actions.ts`.
 *
 * WHY: the real dashboard fetchers take NO arguments — the server resolves
 * the conference from the request domain, never from client input — so the
 * per-instance mock registry in `./mock-admin-actions.ts` can no longer key
 * on a fetcher argument. Every widget does, however, pass `conference?._id`
 * in its `useWidgetData` deps (so a conference change refetches). This
 * wrapper lifts those ids out of the deps and invokes the fetcher inside
 * `runWithMockScope`, so the mocked action — called SYNCHRONOUSLY inside the
 * fetcher closure — can look up the mock registered for that fixture id.
 *
 * The hook behaviour itself is untouched: it delegates to the REAL
 * `useWidgetData` (relative import below, so the Storybook alias — which only
 * matches the `@/`-prefixed id — cannot re-resolve it back to this file).
 */

import { useWidgetData as realUseWidgetData } from '../../../../../hooks/dashboard/useWidgetData'
import { runWithMockScope } from './mock-admin-actions'

function scopeCandidatesFrom(deps: unknown[]): string[] {
  const candidates: string[] = []
  for (const dep of deps) {
    if (typeof dep === 'string') {
      candidates.push(dep)
    } else if (
      dep !== null &&
      typeof dep === 'object' &&
      '_id' in dep &&
      typeof (dep as { _id: unknown })._id === 'string'
    ) {
      candidates.push((dep as { _id: string })._id)
    }
  }
  return candidates
}

export function useWidgetData<T>(
  fetcher: (() => Promise<T>) | null,
  deps: unknown[],
) {
  const candidates = scopeCandidatesFrom(deps)
  const wrapped = fetcher ? () => runWithMockScope(candidates, fetcher) : null
  return realUseWidgetData<T>(wrapped, deps)
}
