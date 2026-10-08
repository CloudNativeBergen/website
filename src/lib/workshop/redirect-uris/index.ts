/**
 * WorkOS redirect URIs for the workshop portal's sign-in (#1297): one per
 * platform-controlled host of a conference with workshops, kept in step by
 * {@link reconcileWorkshopRedirectUris}.
 */

import { runAfterResponse } from '@/server/runAfterResponse'
import { reconcileWorkshopRedirectUris } from './reconcile'

export { reconcileWorkshopRedirectUris } from './reconcile'
export type { RedirectUriReconcileSummary } from './reconcile'

/**
 * Reconcile after the response has gone out. For the mutations that change
 * which hosts may sign in: they must not wait on WorkOS, and cannot be failed
 * by it. What this run misses, the daily sweep picks up.
 */
export function scheduleRedirectUriReconcile(): void {
  runAfterResponse(async () => {
    await reconcileWorkshopRedirectUris()
  })
}
