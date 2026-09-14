import posthog from 'posthog-js'
import {
  ANALYTICS_CONFIG_ELEMENT_ID,
  buildPosthogOptions,
  isAnalyticsExcludedPath,
  landingUtm,
  parseTenantAnalyticsConfig,
  type TenantAnalyticsConfig,
} from './config'
import {
  ANALYTICS_ELIGIBLE_ROUTE_EVENT,
  publishAnalyticsRuntime,
} from './runtime'

/**
 * The side-effecting half of the PostHog client: find the gate, init, publish
 * the runtime. Called once from `instrumentation-client.ts`.
 */

function readConfigElement(doc: Document): TenantAnalyticsConfig | null {
  const element = doc.getElementById(ANALYTICS_CONFIG_ELEMENT_ID)
  if (!element) return null
  return parseTenantAnalyticsConfig({
    token: element.getAttribute('data-token'),
    conference: element.getAttribute('data-conference'),
  })
}

/**
 * The config element is rendered by an async server component behind
 * `<Suspense>` (reading the request host must not block the prerendered
 * shell), so on a hard navigation it STREAMS IN after this entry has run.
 * Watch the document until it appears. Once the document has finished loading
 * without it, the stream is normally complete (no token ⇒ no element) — but a
 * slow read can still land after `load`, so instead of giving up the watch
 * hands over to the route gate, a client component rendered NEXT TO the
 * element: its mount signal means the element exists. Either way, nothing
 * polls and nothing stays armed once the element is found.
 */
function waitForConfigElement(win: Window): Promise<Element | null> {
  const doc = win.document
  const find = () => doc.getElementById(ANALYTICS_CONFIG_ELEMENT_ID)
  const found = find()
  if (found) return Promise.resolve(found)

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const element = find()
      if (element) finish(element)
    })
    const onGate = () => {
      const element = find()
      if (element) finish(element)
    }
    const finish = (element: Element | null) => {
      observer.disconnect()
      win.removeEventListener(ANALYTICS_ELIGIBLE_ROUTE_EVENT, onGate)
      resolve(element)
    }
    // The route gate is the fallback after `load`; before it, the observer
    // catches the element the moment it streams in. Both are cheap and only
    // one of them ever resolves.
    win.addEventListener(ANALYTICS_ELIGIBLE_ROUTE_EVENT, onGate)
    if (doc.readyState !== 'complete') {
      observer.observe(doc.documentElement, { childList: true, subtree: true })
      win.addEventListener(
        'load',
        () => {
          observer.disconnect()
          const element = find()
          if (element) finish(element)
        },
        { once: true },
      )
    }
  })
}

/**
 * PostHog must not run under the admin and speaker routes (spec §6.1, #1034
 * item 6): no init, no config request, not just dropped events. The root
 * layout cannot tell routes apart, so the entry checks the path itself and,
 * when the page was opened on an excluded route, waits for the route gate
 * (`AnalyticsRouteGate`) to announce a client-side navigation onto a public
 * one. `before_send` still covers the opposite direction.
 */
function waitForEligibleRoute(win: Window): Promise<void> {
  if (!isAnalyticsExcludedPath(win.location.pathname)) return Promise.resolve()
  return new Promise((resolve) => {
    const listener = () => {
      if (isAnalyticsExcludedPath(win.location.pathname)) return
      win.removeEventListener(ANALYTICS_ELIGIBLE_ROUTE_EVENT, listener)
      resolve()
    }
    win.addEventListener(ANALYTICS_ELIGIBLE_ROUTE_EVENT, listener)
  })
}

export async function initTenantAnalytics(win: Window): Promise<void> {
  if (!(await waitForConfigElement(win))) return
  const config = readConfigElement(win.document)
  if (!config) return

  // Captured BEFORE the route wait and BEFORE init: the bridge needs the URL
  // the visitor LANDED on, and the SDK's own pageview may already be in
  // flight by the time Accept is clicked.
  const utm = landingUtm(win.location.search)

  await waitForEligibleRoute(win)

  posthog.init(config.token, buildPosthogOptions(config))
  publishAnalyticsRuntime(win, { client: posthog, config, landingUtm: utm })
}
