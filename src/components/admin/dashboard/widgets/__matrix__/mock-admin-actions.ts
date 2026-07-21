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
 * Dispatch is keyed by CONFERENCE IDENTITY: every dashboard fetcher receives
 * either the `Conference` object or a conference `_id` string as its first
 * argument. A single story can therefore render many widget instances in
 * different states side by side by giving each instance a conference fixture
 * with a distinct `_id` and registering a mock per id.
 *
 * If a fetcher fires for a conference id with no registered mock the promise
 * rejects loudly, so a forgotten registration shows up as a visible error
 * state in the story instead of silently rendering something plausible.
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

function conferenceIdFrom(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (
    arg !== null &&
    typeof arg === 'object' &&
    '_id' in arg &&
    typeof (arg as { _id: unknown })._id === 'string'
  ) {
    return (arg as { _id: string })._id
  }
  return '(unknown)'
}

function dispatch(action: MockableAction, args: unknown[]): Promise<unknown> {
  const conferenceId = conferenceIdFrom(args[0])
  const impl = registry.get(keyOf(conferenceId, action))
  if (!impl) {
    return Promise.reject(
      new Error(
        `[matrix] no mock registered for ${action} (conference "${conferenceId}"). ` +
          `Call setMockActionFor('${conferenceId}', '${action}', …) in the story module.`,
      ),
    )
  }
  return impl(...args)
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
