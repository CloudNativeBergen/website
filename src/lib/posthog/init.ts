import posthog from 'posthog-js'
import {
  ANALYTICS_CONFIG_ELEMENT_ID,
  buildPosthogOptions,
  landingUtm,
  parseTenantAnalyticsConfig,
  type TenantAnalyticsConfig,
} from './config'
import { publishAnalyticsRuntime } from './runtime'

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
 * Watch the document until it appears, and give up once the document has
 * finished loading without it — the stream is complete by `load`, so an
 * element that is not there by then is not coming (no token ⇒ no element).
 */
function waitForConfigElement(win: Window): Promise<Element | null> {
  const doc = win.document
  const found = doc.getElementById(ANALYTICS_CONFIG_ELEMENT_ID)
  if (found) return Promise.resolve(found)
  if (doc.readyState === 'complete') return Promise.resolve(null)

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const element = doc.getElementById(ANALYTICS_CONFIG_ELEMENT_ID)
      if (!element) return
      finish(element)
    })
    const onLoad = () => finish(doc.getElementById(ANALYTICS_CONFIG_ELEMENT_ID))
    const finish = (element: Element | null) => {
      observer.disconnect()
      win.removeEventListener('load', onLoad)
      resolve(element)
    }
    observer.observe(doc.documentElement, { childList: true, subtree: true })
    win.addEventListener('load', onLoad)
  })
}

export async function initTenantAnalytics(win: Window): Promise<void> {
  if (!(await waitForConfigElement(win))) return
  const config = readConfigElement(win.document)
  if (!config) return

  // Captured BEFORE init: the SDK's own pageview may already be in flight by
  // the time Accept is clicked, and the bridge needs the landing URL, not the
  // current one.
  const utm = landingUtm(win.location.search)

  posthog.init(config.token, buildPosthogOptions(config))
  publishAnalyticsRuntime(win, { client: posthog, config, landingUtm: utm })
}
