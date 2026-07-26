/**
 * Browser-safe stand-in for `@/app/(admin)/admin/actions`.
 *
 * The real module is a `'use server'` action module — it can never load in the
 * Storybook browser bundle, which is why the widget state x size matrix was
 * unrenderable. `.storybook/main.ts` re-resolves the module id
 * `@/app/(admin)/admin/actions` to THIS file for Storybook builds, so every
 * widget's `import { fetchX } from '@/app/(admin)/admin/actions'` lands here.
 * Matrix stories import the registration helpers below via a relative import,
 * which Vite resolves to the same absolute file — i.e. the exact same module
 * instance the widgets see.
 *
 * Dispatch is keyed by CONFERENCE IDENTITY. The real fetchers take NO
 * arguments (the server resolves the conference from the request domain — a
 * client-supplied conference id would be a cross-tenant hole), so the key can
 * no longer ride on the first argument. Instead, Storybook also re-resolves
 * `@/hooks/dashboard/useWidgetData` to `./mock-use-widget-data.ts`, whose
 * wrapper reads the conference `_id` out of the hook's DEPS (every widget
 * passes `conference?._id` there) and invokes the fetcher inside
 * {@link runWithMockScope}. The mocked action then reads that scope
 * synchronously. A single story can therefore still render many widget
 * instances in different states side by side by giving each instance a
 * conference fixture with a distinct `_id` and registering a mock per id.
 *
 * If a fetcher fires with no registered mock for any in-scope conference id
 * the promise rejects loudly, so a forgotten registration shows up as a
 * visible error state in the story instead of silently rendering something
 * plausible.
 */

export type MockableAction =
  | 'fetchMyAreasData'
  | 'fetchSponsorPipelineData'
  | 'fetchDeadlines'
  | 'fetchCFPHealth'
  | 'fetchSpeakerEngagement'
  | 'fetchTicketSales'
  | 'fetchRecentActivity'
  | 'fetchQuickActions'
  | 'fetchProposalPipeline'
  | 'fetchReviewProgress'
  | 'fetchTravelSupport'
  | 'fetchWorkshopCapacity'
  | 'fetchScheduleStatus'

type MockImpl = (...args: unknown[]) => Promise<unknown>

const registry = new Map<string, MockImpl>()

const keyOf = (conferenceId: string, action: MockableAction) =>
  `${conferenceId}::${action}`

/**
 * Register a mock implementation for one action, scoped to the conference
 * fixture whose `_id` is `conferenceId`. Stories call this at module scope —
 * each story file uses ids namespaced by widget type (`cfp-health/dense`) so
 * registrations from different story modules can never collide.
 */
export function setMockActionFor(
  conferenceId: string,
  action: MockableAction,
  impl: MockImpl,
): void {
  registry.set(keyOf(conferenceId, action), impl)
}

/** Remove every registered mock (only needed by tests, not by stories). */
export function resetMockActions(): void {
  registry.clear()
}

/* ---------- Result helpers for stories ---------- */

/** A promise that never settles — pins `useWidgetData` in its loading state. */
export const mockPending = (): Promise<never> => new Promise<never>(() => {})

/** A rejecting fetcher — drives `useWidgetData` into its error state. */
export const mockFailure = (): Promise<never> =>
  Promise.reject(new Error('[matrix] simulated fetch failure'))

/** A fetcher resolving to the given fixture. */
export const mockResolved =
  <T>(value: T) =>
  (): Promise<T> =>
    Promise.resolve(value)

/* ---------- Dispatch ---------- */

/**
 * The conference-id candidates for the CURRENT fetcher invocation, set
 * synchronously by {@link runWithMockScope} for exactly the duration of the
 * (synchronous) fetcher call. The fetcher body calls the mocked action
 * synchronously, so the scope can never leak across widget instances —
 * regardless of effect ordering, StrictMode double-invocation or refetches.
 */
let currentScope: readonly string[] | null = null

/**
 * Run `fn` (a widget's fetcher closure) with the given conference-id
 * candidates in scope. Called by the story-side `useWidgetData` wrapper
 * (`./mock-use-widget-data.ts`), which extracts the candidates from the
 * hook's deps.
 */
export function runWithMockScope<T>(
  candidates: readonly string[],
  fn: () => T,
): T {
  const prev = currentScope
  currentScope = candidates
  try {
    return fn()
  } finally {
    currentScope = prev
  }
}

function dispatch(action: MockableAction, args: unknown[]): Promise<unknown> {
  const candidates = currentScope ?? []
  for (const candidate of candidates) {
    const impl = registry.get(keyOf(candidate, action))
    if (impl) return impl(...args)
  }
  const scope = candidates.length ? candidates.join('", "') : '(no scope)'
  return Promise.reject(
    new Error(
      `[matrix] no mock registered for ${action} (conference "${scope}"). ` +
        `Call setMockActionFor(<conference _id>, '${action}', …) in the story ` +
        `module, and make sure the widget passes conference?._id in its ` +
        `useWidgetData deps.`,
    ),
  )
}

/* ---------- Mirrored exports of @/app/(admin)/admin/actions ---------- */
/* One export per symbol any dashboard code imports from the actions module.  */

export function fetchMyAreasData(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchMyAreasData', args)
}
export function fetchSponsorPipelineData(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchSponsorPipelineData', args)
}
export function fetchDeadlines(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchDeadlines', args)
}
export function fetchCFPHealth(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchCFPHealth', args)
}
export function fetchSpeakerEngagement(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchSpeakerEngagement', args)
}
export function fetchTicketSales(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchTicketSales', args)
}
export function fetchRecentActivity(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchRecentActivity', args)
}
export function fetchQuickActions(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchQuickActions', args)
}
export function fetchProposalPipeline(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchProposalPipeline', args)
}
export function fetchReviewProgress(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchReviewProgress', args)
}
export function fetchTravelSupport(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchTravelSupport', args)
}
export function fetchWorkshopCapacity(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchWorkshopCapacity', args)
}
export function fetchScheduleStatus(...args: unknown[]): Promise<unknown> {
  return dispatch('fetchScheduleStatus', args)
}

/**
 * Dashboard-config no-ops so ANY import path that pulls in `AdminDashboard`
 * (which imports these) still bundles. `null` = "no stored layout".
 */
export function loadDashboardConfig(): Promise<null> {
  return Promise.resolve(null)
}
export function saveDashboardConfig(): Promise<void> {
  return Promise.resolve()
}
