'use client'

/**
 * The widgets' data fetchers — one server round-trip per dashboard paint.
 *
 * Every widget still calls a plain `fetchX()` with no arguments, exactly as it
 * did when each was its own server action. The difference is what happens
 * between the call and the network: a call ENQUEUES its widget key and returns a
 * promise, and the first microtask after the current commit sends the whole
 * queue as ONE `fetchDashboardData([...])` call.
 *
 * WHY BATCH ON THE CLIENT RATHER THAN LIST THE WIDGETS ON THE SERVER. The rule
 * we must not break is "fetch the union of the widgets that are actually
 * showing". That set is not the saved layout: widgets are phase-filtered by the
 * dashboard, and several null their own fetcher for phases whose view is static
 * (`conference && !isStaticPhase ? () => fetchX() : null`). A fetcher that is
 * never invoked never enqueues, so the batch is exactly the set of widgets that
 * asked — no second copy of the gating logic to drift out of sync, and no
 * "compose 25 queries into one query that reads everything" regression.
 *
 * React invokes all of a commit's effects before yielding, so the widgets of one
 * paint land in one batch. Anything that arrives later (a `refetch()`, a widget
 * added in edit mode, the layout swap after `loadDashboardConfig` resolves)
 * simply forms the next batch.
 *
 * FAILURE ISOLATION. `fetchDashboardData` returns a SETTLED result per widget,
 * so a failing source rejects only its own widget's promise and its own widget's
 * error state — the behaviour when each widget owned an action.
 */

import { fetchDashboardData } from '@/app/(admin)/admin/actions'
import type { DashboardWidgetDataMap, DashboardWidgetKey } from './widget-data'

interface Waiter {
  resolve: (value: never) => void
  reject: (reason: Error) => void
}

/**
 * Keys enqueued for the next flush, each with the callers waiting on it. `null`
 * means no flush is scheduled — creating the map and scheduling the microtask
 * are the same act, so a flush can never be scheduled for an empty queue.
 */
let queue: Map<DashboardWidgetKey, Waiter[]> | null = null

function flush(): void {
  const batch = queue
  queue = null
  if (!batch) return

  const keys = Array.from(batch.keys())
  const failAll = (error: Error) => {
    for (const waiters of batch.values()) {
      for (const waiter of waiters) waiter.reject(error)
    }
  }

  fetchDashboardData(keys)
    .then((result) => {
      for (const [key, waiters] of batch) {
        const slice = result[key]
        for (const waiter of waiters) {
          if (!slice) {
            // The server dropped the key (unknown widget type, or a registry
            // that has drifted). Surfacing the widget's error state is right:
            // resolving `undefined` would render an empty card as if it were
            // real data.
            waiter.reject(
              new Error(`No dashboard data returned for widget "${key}"`),
            )
          } else if (slice.ok) {
            waiter.resolve(slice.value as never)
          } else {
            waiter.reject(new Error(slice.error))
          }
        }
      }
    })
    .catch((error: unknown) => {
      failAll(error instanceof Error ? error : new Error(String(error)))
    })
}

/**
 * Ask for one widget's data. Joins the current batch, or opens a new one.
 *
 * Exported for tests and for any future widget; the named fetchers below are
 * the call sites the widgets actually use.
 */
export function requestWidgetData<K extends DashboardWidgetKey>(
  key: K,
): Promise<DashboardWidgetDataMap[K]> {
  return new Promise<DashboardWidgetDataMap[K]>((resolve, reject) => {
    if (!queue) {
      queue = new Map()
      queueMicrotask(flush)
    }
    const waiter: Waiter = {
      resolve: resolve as (value: never) => void,
      reject,
    }
    const waiters = queue.get(key)
    if (waiters) waiters.push(waiter)
    else queue.set(key, [waiter])
  })
}

/* ---------------------------------------------------------------------------
 * One fetcher per widget. Names are unchanged from the actions they replaced so
 * the widgets — and the Storybook mock registry that keys on these names — read
 * the same as before.
 * ------------------------------------------------------------------------- */

export const fetchQuickActions = () => requestWidgetData('quick-actions')
export const fetchReviewProgress = () => requestWidgetData('review-progress')
export const fetchProposalPipeline = () =>
  requestWidgetData('proposal-pipeline')
export const fetchDeadlines = () => requestWidgetData('upcoming-deadlines')
export const fetchCFPHealth = () => requestWidgetData('cfp-health')
export const fetchScheduleStatus = () => requestWidgetData('schedule-builder')
export const fetchTicketSales = () => requestWidgetData('ticket-sales')
export const fetchSpeakerEngagement = () =>
  requestWidgetData('speaker-engagement')
export const fetchSponsorPipelineData = () =>
  requestWidgetData('sponsor-pipeline')
export const fetchWorkshopCapacity = () =>
  requestWidgetData('workshop-capacity')
export const fetchTravelSupport = () => requestWidgetData('travel-support')
export const fetchRecentActivity = () => requestWidgetData('recent-activity')
export const fetchMyAreasData = () => requestWidgetData('my-areas')
