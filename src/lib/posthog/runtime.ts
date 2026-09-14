import type { TenantAnalyticsConfig } from './config'
import type { ConsentClient } from './consent'

/**
 * The bridge between the instrumentation entry (which owns the PostHog
 * instance) and the React components that need it (the consent bar, the
 * privacy page's choice control).
 *
 * WHY `window` AND NOT A MODULE SINGLETON: `instrumentation-client.ts` is its
 * own bundle entry. Whether it shares module instances with the app's client
 * chunks is a bundler detail, and a duplicated `posthog-js` module would mean
 * the bar opting in a DIFFERENT instance from the one capturing events — a
 * failure nothing would report. A property on `window` plus a DOM event is
 * bundler-proof, and the components never import `posthog-js` at all.
 */

export interface TenantAnalyticsRuntime {
  client: ConsentClient
  config: TenantAnalyticsConfig
  landingUtm: Record<string, string>
}

interface RuntimeHost extends EventTarget {
  __tenantAnalytics?: TenantAnalyticsRuntime
}

declare global {
  interface Window {
    __tenantAnalytics?: TenantAnalyticsRuntime
  }
}

/** Fired on `window` once `posthog.init` has run and the runtime is published. */
export const ANALYTICS_READY_EVENT = 'tenant-analytics:ready'

/** Fired on `window` after a consent choice was applied, so every control re-reads it. */
export const ANALYTICS_CONSENT_EVENT = 'tenant-analytics:consent'

/**
 * Fired on `window` by the route gate whenever the app is on a route PostHog
 * may run on. The client entry waits for it when the page was opened on an
 * excluded route (admin, speaker portal) — see `./init`.
 */
export const ANALYTICS_ELIGIBLE_ROUTE_EVENT = 'tenant-analytics:eligible-route'

export function notifyEligibleRoute(host: EventTarget): void {
  host.dispatchEvent(new Event(ANALYTICS_ELIGIBLE_ROUTE_EVENT))
}

export function publishAnalyticsRuntime(
  host: RuntimeHost,
  runtime: TenantAnalyticsRuntime,
): void {
  host.__tenantAnalytics = runtime
  host.dispatchEvent(new Event(ANALYTICS_READY_EVENT))
}

export function getAnalyticsRuntime(
  host: RuntimeHost,
): TenantAnalyticsRuntime | undefined {
  return host.__tenantAnalytics
}

/**
 * Subscribe to the runtime: called synchronously if it is already published
 * (the component mounted after init), otherwise once when it is (the component
 * mounted first — the common case, since the config element streams in after
 * the shell). Returns the unsubscribe.
 */
export function onAnalyticsRuntime(
  host: RuntimeHost,
  callback: (runtime: TenantAnalyticsRuntime) => void,
): () => void {
  const existing = getAnalyticsRuntime(host)
  if (existing) {
    callback(existing)
    return () => {}
  }
  const listener = () => {
    const runtime = getAnalyticsRuntime(host)
    if (runtime) callback(runtime)
  }
  host.addEventListener(ANALYTICS_READY_EVENT, listener, { once: true })
  return () => host.removeEventListener(ANALYTICS_READY_EVENT, listener)
}

export function notifyConsentChanged(host: EventTarget): void {
  host.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT))
}
