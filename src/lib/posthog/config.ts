import type { CaptureResult, PostHogConfig } from 'posthog-js'
import { CTA_CAPTURE_ATTR, resolvePosthogToken } from '@/lib/analytics'
import { POSTHOG_INGEST_PATH } from './ingest'

export { POSTHOG_INGEST_PATH, posthogRewrites } from './ingest'

/**
 * PostHog client configuration (issue #1008, spec §6.1). PURE — no `posthog-js`
 * runtime import, no DOM — so every decision here is unit-testable. The
 * side-effecting init lives in `./init` and is called from
 * `instrumentation-client.ts`.
 */

/**
 * The element the root layout's `TenantAnalytics` renders when — and only
 * when — the organization has a token. Its absence is the gate: no element, no
 * init. The client entry reads it (`data-token`, `data-conference`).
 */
export const ANALYTICS_CONFIG_ELEMENT_ID = 'tenant-analytics'

export interface TenantAnalyticsConfig {
  /** The organization's PUBLIC PostHog project token (`phc_…`). */
  token: string
  /**
   * The conference document id, registered as the `conference` super property
   * on every event so one project (one organization) can be filtered per
   * edition. The id, not a title: it is what the rest of the platform keys a
   * conference by, and it is already public in the page payload.
   */
  conference: string
}

/**
 * Validate the server-rendered gating values. Both are re-checked here even
 * though the server validated them: the element is part of the page and this
 * is the last step before the token is interpolated into request paths.
 */
export function parseTenantAnalyticsConfig(
  raw: { token?: string | null; conference?: string | null } | null | undefined,
): TenantAnalyticsConfig | null {
  if (!raw) return null
  const token = resolvePosthogToken(raw.token)
  const conference = raw.conference?.trim()
  if (!token || !conference) return null
  return { token, conference }
}

/**
 * Paths PostHog must not count (spec §6.1, #1034 item 6): the organizer admin
 * and the speaker portal (`/cfp/*` plus the speaker `/notifications` page,
 * both behind the `(cfp)` layout's speaker check). Neither is public traffic,
 * and organizer clicks must never land in a Campaign's Outcomes. The public
 * `/cfp` landing page is NOT excluded — it is where the `cta-cfp-*` buttons
 * send visitors. Used twice: the client entry does not init on these paths
 * (`./init`), and `before_send` drops events captured on them after a
 * client-side navigation into one.
 */
const EXCLUDED_PATH_PREFIXES = ['/admin', '/cfp/', '/notifications'] as const

export function isAnalyticsExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`),
  )
}

/**
 * The `before_send` predicate. The init is gated by the root layout, which
 * cannot tell one route from another, and a client-side navigation from the
 * home page into `/admin` keeps the same PostHog instance alive, so the
 * exclusion has to be enforced per event. Reads the SDK's own `$pathname`
 * (set on every event) and falls back to `$current_url`; an event that names
 * no page is kept.
 */
export interface OutgoingEvent {
  event?: string
  properties?: Record<string, unknown> | undefined
}

export function keepAnalyticsEvent(event: OutgoingEvent): boolean {
  const props = event.properties ?? {}
  let pathname = typeof props.$pathname === 'string' ? props.$pathname : null
  if (pathname === null && typeof props.$current_url === 'string') {
    try {
      pathname = new URL(props.$current_url).pathname
    } catch {
      pathname = null
    }
  }
  return pathname === null ? true : !isAnalyticsExcludedPath(pathname)
}

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

/**
 * The landing URL's UTM parameters, captured at init and replayed into the
 * client session on Accept. Cookieless visitors attribute through the server
 * session's entry UTMs; an accepting visitor starts a NEW client session with
 * no entry UTMs, so without this replay their later CTA clicks would carry no
 * campaign at all (#1000 finding 4–5).
 */
export function landingUtm(search: string): Record<string, string> {
  const params = new URLSearchParams(search)
  const out: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim()
    if (value) out[key] = value
  }
  return out
}

/**
 * Guarantee `conference` on EVERY event. `register({ conference })` in
 * `loaded` covers the normal path, but the SDK resets persistence inside
 * `opt_in_capturing()` and captures both `$opt_in` and a fresh `$pageview`
 * BEFORE the consent bridge can re-register — and that pageview is the entry
 * event of the accepted session, the one attribution keys on. Stamping it here
 * closes that window for every SDK-internal capture, whatever else changes.
 */
export function withConference<E extends OutgoingEvent>(
  event: E,
  conference: string,
): E {
  if (event.properties?.conference !== undefined) return event
  return { ...event, properties: { ...event.properties, conference } }
}

/** The `posthog.init` options for one tenant. See spec §6.1 for each choice. */
export function buildPosthogOptions(
  config: TenantAnalyticsConfig,
): Partial<PostHogConfig> {
  return {
    api_host: POSTHOG_INGEST_PATH,
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-05-30',
    // Hybrid consent (#1034): a visitor who has not answered is counted
    // cookielessly (daily-salted server hash, nothing stored on the device);
    // Accept calls `opt_in_capturing()` and only then does a cookie appear.
    // The project setting "Web analytics → cookieless" must be on.
    cookieless_mode: 'on_reject',
    opt_out_capturing_by_default: true,
    // The choice itself (#1034 item 4): one year, per site domain. A cookie
    // expires (`cookie_expiration` defaults to 365 days); the SDK's default
    // localStorage flag never would. Host-only, so two editions on sibling
    // subdomains do not share one answer.
    opt_out_capturing_persistence_type: 'cookie',
    cross_subdomain_cookie: false,
    person_profiles: 'identified_only',
    disable_session_recording: true,
    disable_surveys: true,
    // Only marked CTAs, only clicks. The allowlist matches the target or any
    // ancestor, so an icon inside a marked button still counts as the button.
    autocapture: {
      dom_event_allowlist: ['click'],
      css_selector_allowlist: [`[${CTA_CAPTURE_ATTR}]`],
    },
    before_send: (event: CaptureResult | null) =>
      event && keepAnalyticsEvent(event)
        ? withConference(event, config.conference)
        : null,
    loaded: (ph) => {
      ph.register({ conference: config.conference })
    },
  }
}
