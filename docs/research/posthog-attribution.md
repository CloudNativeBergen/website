# PostHog: setup, UTM attribution and read-back for this multi-tenant site

Research for [#988](https://github.com/CloudNativeBergen/website/issues/988), a sub-issue of the
Marketing Plan wayfinder map ([#987](https://github.com/CloudNativeBergen/website/issues/987)).
It replaces the Pirsch parts of `docs/research/link-attribution.md` (branch
`research/link-attribution`, [#932](https://github.com/CloudNativeBergen/website/issues/932));
the UTM scheme and the Tito/Checkin.no findings from that document still stand.

**Question.** How should PostHog replace Pirsch on this Next.js / Vercel multi-tenant site, and how
do we read Campaign and Task attribution back out of it?

**Answer in one line.** One EU-cloud project, `posthog-js` initialised from `instrumentation-client.ts`
behind a Next.js rewrite proxy, tenant stamped as a super property in the `loaded` callback,
`data-pirsch-event` renamed to `data-ph-capture-attribute-cta` under a restricted autocapture
allowlist, and the Marketing Report read through the Query API with HogQL grouped on
`$session_entry_utm_campaign` / `$session_entry_utm_content` — free at this site's volume, with a
project-scoped **personal** API key as the one new secret.

Sources: PostHog claims cite posthog.com docs or the `posthog-js` source (checked at
`packages/browser` **1.430.3**, commit `56d1d1d`, 2026-09-12); repo claims cite file and line.
Dated facts (pricing, limits) are as of **2026-09-13**. §8 lists what could not be verified.

---

## 0. What the repo does today (the migration surface)

| Fact                                                                                                                                                            | Where                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pirsch `pa.js` is rendered by an async `TenantAnalytics` server component behind `<Suspense>`, only when `conference.analyticsPirschCode` resolves; no fallback | `src/app/layout.tsx:165-182`, `src/lib/analytics.ts` (`resolvePirschCode`)                  |
| The tenant is resolved from the `Host` header per request; the host is a cache key and a GROQ parameter, never read inside `'use cache'`                        | `src/lib/conference/sanity.ts` (`getConferenceForCurrentDomain`, `fetchConferenceData`)     |
| A conference owns one or more domains (`conference.domains[]`, required, unique)                                                                                | `sanity/schemaTypes/conference.ts:1372`                                                     |
| 21 declarative click events via `data-pirsch-event` + `data-pirsch-meta-position`, on **server components** (`Hero`, `CallToAction`, `ProgramHighlights`, `Sponsors`, `TicketsStatusNotice`, `PhaseCtaRow`, `/tickets`); only `Header` is a client component | `src/lib/analytics.ts` (`PIRSCH_EVENTS`), `grep -rl data-pirsch-event src`                  |
| The admin homepage preview strips `data-pirsch-event` with a `MutationObserver` so preview clicks are not counted                                               | `src/components/admin/preview/usePreviewDomGuard.ts`                                        |
| Admin → Settings → Analytics edits the code; Zod validates the shape on the write path                                                                          | `src/app/(admin)/admin/settings/page.tsx:642-660`, `src/server/schemas/conference.ts:280-291` |
| The subprocessor disclosure lists Pirsch only when a code is set                                                                                                | `src/lib/legal/subprocessors.resolve.ts:128`, `src/lib/legal/subprocessors.test.ts:139`      |
| The privacy page promises "cookie-less and aggregated" analytics and "no advertising or cross-site tracking"                                                    | `src/app/(main)/privacy/page.tsx:1760-1810`                                                 |
| `next.config.ts` has no `rewrites()`; there is no `middleware.ts`/`proxy.ts`                                                                                     | `next.config.ts:55-83`                                                                      |
| Secret families are `ticketing \| email \| slack \| push \| badge`; per-tenant bags resolve via `TENANT_<SLUG>_<FAMILY>_<FIELD>`                                 | `src/lib/secrets/types.ts:799`, `docs/TENANT_SECRETS.md`                                    |
| Background work is Vercel cron → `src/app/api/cron/*`                                                                                                           | `src/app/api/cron/`                                                                          |

Everything Pirsch-shaped is behind three seams — the layout component, `src/lib/analytics.ts`, and
the `analyticsPirschCode` field — so the swap is contained.

---

## 1. Setup

### 1.1 Client SDK: `instrumentation-client.ts`, not `next/script`

PostHog's Next.js guide now shows exactly one client setup: an `instrumentation-client.ts` at the
project root (or `src/`) calling `posthog.init`
([docs/libraries/next-js](https://posthog.com/docs/libraries/next-js)). The provider-component
variant is offered only for Next.js < 15.3 ([web-analytics/installation/nextjs](https://posthog.com/docs/web-analytics/installation/nextjs));
we are on Next 16 (`package.json:90`). No `next/script`, no manual pageview component: with
`defaults: '2025-05-24'` or later `capture_pageview` becomes `'history_change'`, which fires a
`$pageview` on App Router path changes ([docs/libraries/js/config](https://posthog.com/docs/libraries/js/config)).

```ts
// instrumentation-client.ts
import posthog from 'posthog-js'

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: '/<proxy-path>',            // §1.2
  ui_host: 'https://eu.posthog.com',
  defaults: '2026-05-30',               // the value every current doc sample uses
  person_profiles: 'identified_only',   // default; keeps every event anonymous (§5.4)
  autocapture: { /* §4 */ },
  loaded: (ph) => ph.register({ conference: window.__CONFERENCE_SLUG__ }), // §2
})
```

`defaults` snapshots are cumulative; the table lives at
[docs/libraries/js/config](https://posthog.com/docs/libraries/js/config). `'2026-01-30'` and later
inject external scripts into `<head>`, which is PostHog's fix for the Next.js hydration errors in
[posthog-js#2781](https://github.com/PostHog/posthog-js/issues/2781). The docs' samples all use
`'2026-05-30'` even though `'2026-08-30'` is the newest snapshot; the reason is not documented.

**Tenant gating.** Today the script renders only when a tenant has configured a code. The same
policy survives: `instrumentation-client.ts` runs on every page, so gate on a value the server
renders (e.g. a `<meta name="ph-conference">` or a `window.__CONFERENCE_SLUG__` emitted by
`TenantAnalytics`) and skip `posthog.init` when it is absent. See §2 for why the tenant key belongs
in `loaded` rather than a later effect.

**Pre-release alternative.** `@posthog/next` bundles a server-component provider, a built-in
`/ingest` proxy via `postHogMiddleware`, and cookie-based identity linking, but is labelled
"Pre-release. The API may change… For production apps, see the standard Next.js setup guide"
([docs/libraries/next-js/posthog-next](https://posthog.com/docs/libraries/next-js/posthog-next)).
Its `bootstrapFlags` calls `cookies()` and would make every route under the root layout dynamic. Not
for slice 1.

### 1.2 Reverse proxy through Next.js rewrites (fits every tenant domain)

From [docs/advanced/proxy/nextjs](https://posthog.com/docs/advanced/proxy/nextjs), EU hosts substituted:

```ts
// next.config.ts
async rewrites() {
  return [
    { source: '/<proxy-path>/static/:path*', destination: 'https://eu-assets.i.posthog.com/static/:path*' },
    { source: '/<proxy-path>/array/:path*',  destination: 'https://eu-assets.i.posthog.com/array/:path*' },
    { source: '/<proxy-path>/:path*',        destination: 'https://eu.i.posthog.com/:path*' },
  ]
},
skipTrailingSlashRedirect: true,
```

Points from that page that bind us:

- `skipTrailingSlashRedirect: true` is **required** ("PostHog's API uses trailing slashes… Next.js
  would redirect them and break event capture"). It makes `/page` and `/page/` both resolve; we
  already emit canonical URLs (`src/lib/seo/canonical.ts`).
- Static/array rules must precede the catch-all; the `/array/` rule exists because the asset server
  keeps `cache-control` headers the API server strips.
- Do **not** name the path `/analytics`, `/tracking`, `/telemetry` or `/posthog` — blockers match them.
- If a `proxy.ts` (Next 16's `middleware.ts`) is ever added, its `matcher` must exclude the proxy
  path; the failure is silent (assets load, `/e/` is 307'd). We have none today.
- The proxy forwards cookies by default; use `persistence: 'localStorage'` or strip `cookie` if that
  matters. Irrelevant in cookieless mode (§1.4).
- Cost: rewrites route all PostHog traffic through Vercel and count toward Fast Data Transfer and
  Edge Requests; session replay is the driver PostHog warns about. We will not enable replay.

Why rewrites rather than the free **managed reverse proxy**
([docs/advanced/proxy/managed-reverse-proxy](https://posthog.com/docs/advanced/proxy/managed-reverse-proxy)):
the managed proxy is one CNAME per hostname, so per-conference domains would each need their own,
and it terminates on Cloudflare with EU-only edge termination "not contractually enforced"
([docs/advanced/proxy](https://posthog.com/docs/advanced/proxy)). Rewrites are first-party on every
tenant domain automatically and stay inside Vercel + Frankfurt.

A **Vercel Marketplace integration** exists (new org billed through Vercel, or link an existing
account; region fixed at install; one PostHog org per Vercel team)
([docs/integrations/vercel-marketplace](https://posthog.com/docs/integrations/vercel-marketplace)).
Optional; it only sets env vars.

### 1.3 Server side: `posthog-node`

```ts
import { PostHog } from 'posthog-node'
const client = new PostHog(token, { host: 'https://eu.i.posthog.com', flushAt: 1, flushInterval: 0 })
client.capture({ distinctId, event: 'tickets:order_complete', properties: { conference, $process_person_profile: false } })
await client.flush()
```

`flushAt: 1, flushInterval: 0` is the documented setting for short-lived Next.js server functions
([docs/libraries/next-js](https://posthog.com/docs/libraries/next-js)). The Next.js page says
`await posthog.shutdown()`; the Node page says that in a reused serverless container `flush()` is
right and `shutdown()` "would throw away the connection pool" ([docs/libraries/node](https://posthog.com/docs/libraries/node)).
Use `flush()` on a module-level singleton. `disableGeoip` defaults to `true` server-side. To join a
server event to the browser session, pass `$session_id` obtained client-side via
`posthog.get_session_id()` ([docs/data/sessions](https://posthog.com/docs/data/sessions)) or enable
`tracing_headers` so fetches carry `X-POSTHOG-DISTINCT-ID` / `X-POSTHOG-SESSION-ID`. Slice 1 does not
need server-side capture; §6 is where it would enter.

### 1.4 EU cloud, cookies and consent

- **EU cloud** is a separate instance in AWS `eu-central-1` (Frankfurt); nothing is transferred to
  the US; same price ([blog/posthog-cloud-eu](https://posthog.com/blog/posthog-cloud-eu)). Region is
  fixed per organization at sign-up; moving later is a PostHog-run migration on Scale/Enterprise
  ([docs/settings/projects](https://posthog.com/docs/settings/projects)). EU organizations default to
  IP capture disabled ([docs/privacy/data-collection](https://posthog.com/docs/privacy/data-collection)).
  Private API host is `eu.posthog.com`, ingestion host `eu.i.posthog.com` ([docs/api](https://posthog.com/docs/api)).
- **Default persistence** is `localStorage+cookie`: a first-party cookie `ph_<token>_posthog`, 365
  days, plus localStorage ([docs/libraries/js/persistence](https://posthog.com/docs/libraries/js/persistence)).
  That contradicts the privacy page's "cookie-less" promise (§0), so the default is not acceptable
  as-is.
- **Cookieless server hash mode** is the Pirsch-equivalent. `cookieless_mode: 'always'` stores
  nothing in cookie, local or session storage; identity is `hash(team_id, daily_salt, ip, user_agent, hostname)`
  computed at ingestion, salt rotated daily and deleted ([tutorials/cookieless-tracking](https://posthog.com/tutorials/cookieless-tracking)).
  It **must also be enabled in Project settings → Web analytics**, or events are dropped (SDK JSDoc
  on `cookieless_mode`, `packages/types/src/posthog-config.ts:2317-2329`). `'on_reject'` is the
  banner variant: nothing is captured until consent is answered. What `'always'` loses: uniques
  inflate across days (new salt), same-IP+UA collapses (corporate networks), no session replay or
  surveys, no GeoIP or bot detection, `alias()` dropped, `identify()` discouraged.
- **Consequence for attribution (source, not docs):** with `cookieless_mode: 'always'` the SDK
  disables persistence (`_is_persistence_disabled`, `posthog-core.ts:4532`) and does **not** create a
  `SessionIdManager` or `SessionPropsManager` (`posthog-core.ts:892-896`). So the client sends no
  `$session_id` and no `$session_entry_*` properties; the server assigns the session. The `utm_*`
  super properties still live in memory for the page's lifetime, which covers App Router client
  navigation but not a full reload. The `sessions` table is built server-side from events, so the
  `session.$entry_utm_*` join in §5 should still work — flagged in §8 as the one thing to verify
  empirically before building the report on it.
- **Do not gate the script on consent.** PostHog's own guidance: "Always load posthog-js" and use
  `opt_out_capturing_by_default` + `opt_in_capturing()` if a banner is wanted
  ([docs/privacy/data-collection](https://posthog.com/docs/privacy/data-collection)).
- `ip: false` is a no-op ("THIS OPTION HAS NO EFFECT"); IP handling is the project/org "IP data
  capture" setting ([references/posthog-js/types/PostHogConfig](https://posthog.com/docs/references/posthog-js/types/PostHogConfig)).

**Recommendation.** `cookieless_mode: 'always'` with the project setting on, `person_profiles:
'identified_only'`, no session replay, no banner. This keeps the privacy page truthful (update the
wording from "Pirsch" to "PostHog EU, cookieless"), keeps every event anonymous (cheapest tier,
§5.4), and matches Pirsch's behaviour. Revisit `'on_reject'` only if a tenant needs replay or
cross-day uniques.

---

## 2. Multi-tenant scoping

**One project, tenant as an event property.** PostHog "strongly recommend[s] keeping your apps and
marketing website on the same production project" and segmenting by `host` or super properties
([docs/settings/projects](https://posthog.com/docs/settings/projects)); separate projects are for
unrelated products or embedded analytics that must isolate customers' data. Free organizations are
limited to **one project** anyway; pay-as-you-go ($0 base) gives 6, Boost and up unlimited
([pricing](https://posthog.com/pricing)). Every project has its own write-only token.

How the tenant lands on every event:

| Mechanism                                    | Notes                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$host` (automatic)                          | Set on every event from `location.host` (`browser-common/src/utils/event-utils.ts`, `getEventProperties`). Free, but splits a tenant with several `domains[]` and tracks the hostname, not the conference.                                                          |
| `posthog.register({ conference: slug })`     | Super property, sent with every event ([docs/libraries/js/usage](https://posthog.com/docs/libraries/js/usage#super-properties)). Call it inside `loaded`: `_loaded()` runs `config.loaded(this)` **before** the deferred initial `$pageview` (`posthog-core.ts`), so the landing pageview carries it. A later React effect can miss it. In cookieless mode it is memory-only, so it is set on every page load anyway. |
| `before_send`                                | Runs after property calculation; documented as advanced and warned against for core features. Not needed.                                                                                                                                                         |
| Group analytics `posthog.group('conference')` | **Do not.** Paid add-on, and a non-empty group forces person processing on (`_hasPersonProcessing`, `posthog-core.ts`), turning anonymous events into billed identified ones ([docs/product-analytics/group-analytics](https://posthog.com/docs/product-analytics/group-analytics)). |

Recommend: register `conference` (the conference slug or `_id`) in `loaded`; keep `$host` as a
cross-check and for the web analytics dashboard's host filter.

Cross-domain identity: storage is per origin and the cookie domain is the registrable domain
(`storage.ts`, `chooseCookieDomain`), so tenants on different apexes never share a person — the
behaviour we want. Sibling subdomains of one apex would share by default (`cross_subdomain_cookie`),
and the SDK forces it off on `*.vercel.app` previews (`general-utils.ts`,
`EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE`). All moot under cookieless mode.

---

## 3. UTM and campaign capture

### 3.1 What is captured, where it lands

`posthog-js` reads these from the URL on every URL change, with no configuration
(`browser-common/src/utils/event-utils.ts`, `CAMPAIGN_PARAMS`): `utm_source`, `utm_medium`,
`utm_campaign`, `utm_content`, `utm_term`, `gad_source`, `mc_cid`, plus click IDs (`gclid`,
`gclsrc`, `dclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `twclid`, `li_fat_id`, `igshid`,
`ttclid`, `rdt_cid`, `epik`, `qclid`, `sccid`, `irclid`, `_kx`). Extra keys via
`custom_campaign_params` ([docs/data/utm-segmentation](https://posthog.com/docs/data/utm-segmentation)).

They are set in three places ([docs/data/utm-segmentation](https://posthog.com/docs/data/utm-segmentation)):

1. **Event properties** `utm_campaign` etc. on **every** event, not only `$pageview`. Source:
   `capture()` calls `sessionPersistence.update_campaign_params()`, which `register()`s the params
   into the session-scoped persistence (sessionStorage, per tab), and `calculateEventProperties`
   merges `sessionPersistenceProperties` into every event (`posthog-core.ts:1705-1710`,
   `:2097-2130`; `posthog-persistence.ts:1621-1638`). A URL without UTMs does **not** clear them
   (`hasCampaignParams` false → no `register`), a URL with new UTMs overwrites them.
2. **Person properties** `$initial_utm_*` (`$set_once`) and latest `utm_*` (`$set`) — **only for
   identified persons**. With the default `identified_only`, anonymous events skip `$set_once`
   (`_calculate_set_once_properties` returns early without person processing) and "latest"
   properties are never backfilled ([docs/web-analytics/campaign-attribution-troubleshooting](https://posthog.com/docs/web-analytics/campaign-attribution-troubleshooting)).
   Also cross-tenant: one person's `$initial_*` is claimed by whichever site they hit first, and by
   ingestion order rather than timestamp ([docs/product-analytics/person-properties](https://posthog.com/docs/product-analytics/person-properties)).
   **Do not build the report on person properties.**
3. **Session properties** `$entry_utm_source|medium|campaign|content|term`, `$entry_referring_domain`,
   `$entry_current_url`, `$channel_type`, `$is_bounce` on the `sessions` table; a session is 30 min
   idle / 24 h max ([docs/data/sessions](https://posthog.com/docs/data/sessions)). The SDK mirrors
   them onto every event as `$session_entry_utm_campaign` etc. (`session-props.ts`,
   `getSessionProps`) — except in cookieless mode, where the client has no session manager (§1.4).

### 3.2 Does a `cta-tickets-hero` click join to `utm_campaign` / `utm_content`? Yes

This is the fact the Pirsch research had to infer; in PostHog it is in the code. After landing on
`/tickets?utm_campaign=speaker-announce&utm_content=task-42` and clicking the CTA — even after
client-side navigation elsewhere first — the click event carries `utm_campaign` and `utm_content`
as plain event properties (§3.1 item 1), and, outside cookieless mode, `$session_entry_utm_*` as
well. Two caveats:

- The SDK sends **every** campaign key when at least one is present, with JSON `null` for the
  missing ones; test with `isNotNull(properties.utm_content)`, not `!= ''`
  ([campaign-attribution-troubleshooting](https://posthog.com/docs/web-analytics/campaign-attribution-troubleshooting)).
- `update_campaign_params` skips when `document.URL` is unchanged, and the first `$pageview` is
  deferred by `setTimeout(…, 1)`. Nothing in this repo rewrites the URL on load, but if a future
  `router.replace` strips `utm_*` synchronously, verify the landing `$pageview` still carries them.

### 3.3 Against the scheme in `link-attribution.md`

The scheme (`utm_source`=Channel, `utm_medium=social`, `utm_campaign`=Campaign slug,
`utm_content`=Task id, `utm_term` reserved) transfers unchanged, and PostHog improves on two Pirsch
limitations:

- **`utm_content` is a first-class dimension.** The web analytics dashboard has `UTM content` and
  `UTM term` tabs with a source → medium → campaign → content → term drill-down
  ([docs/web-analytics/dashboard](https://posthog.com/docs/web-analytics/dashboard);
  `frontend/src/scenes/web-analytics/common.ts`), so an organizer sees per-Task rows in the UI
  without the "filter first" dance Pirsch required.
- **`utm_source` does not overwrite the referrer.** `$referrer` / `$referring_domain` are recorded
  independently, so the referrer is independent evidence.
- **Channel type.** `utm_medium=social` classifies as **Organic Social**; `paid-social`, `cpc`, etc.
  would be Paid Social ([docs/data/channel-type](https://posthog.com/docs/data/channel-type)).
  `utm_source=bluesky` is not in PostHog's social-source list; a custom channel rule (`utm_source =
  bluesky` → Organic Social) in project settings fixes the dashboard's channel tile.
- The "point the Task at the page that carries the CTA" advice still holds, but now as belt and
  braces rather than a correctness requirement.

---

## 4. Migrating the 21 Pirsch click events

### 4.1 Least invasive: autocapture + `data-ph-capture-attribute-*`

Autocapture records `$autocapture` on click/change/submit of `a`, `button`, `form`, `input`,
`select`, `textarea`, `label` ([docs/product-analytics/autocapture](https://posthog.com/docs/product-analytics/autocapture)).
Any `data-ph-capture-attribute-<key>="<value>"` on the element or an ancestor becomes event property
`<key>` — the suffix verbatim, closest element wins (`autocapture.ts:47-66`). It applies to the
autocapture family only, not to `posthog.capture()` custom events.

Mechanical rename, no client components, works in the server components that carry the buttons:

```diff
- data-pirsch-event={PIRSCH_EVENTS.ticketsHero}
+ data-ph-capture-attribute-cta={ANALYTICS_EVENTS.ticketsHero}
- data-pirsch-meta-position="standouts"
+ data-ph-capture-attribute-position="standouts"
```

Restrict autocapture so we are not buying the whole click firehose:

```ts
autocapture: {
  css_selector_allowlist: ['[data-ph-capture-attribute-cta]'],
  dom_event_allowlist: ['click'],
  element_allowlist: ['a', 'button'],
},
capture_dead_clicks: false,
rageclick: false,
```

(`css_selector_allowlist` shape from [docs/privacy/data-collection](https://posthog.com/docs/privacy/data-collection);
option names from [docs/libraries/js/config](https://posthog.com/docs/libraries/js/config).)

Consequences of this route:

- All 21 events become **one** event name `$autocapture`, distinguished by `properties.cta`. Queries
  use `countIf(event = '$autocapture' AND properties.cta = 'cta-tickets-hero')`; or define one
  **Action** per CTA on the selector `[data-ph-capture-attribute-cta="cta-tickets-hero"]` — Actions
  are retroactive, usable as web-analytics conversion goals, and queryable with
  `matchesAction('name')` ([docs/data/actions](https://posthog.com/docs/data/actions),
  [docs/sql/useful-functions](https://posthog.com/docs/data-warehouse/sql/useful-functions)).
- **Outbound clicks come free.** For an `<a>` whose host differs from the page, autocapture adds a
  top-level `$external_click_url` and `attr__href` inside `$elements_chain` (`autocapture.ts:279-296`);
  HogQL exposes `elements_chain_href` (`posthog/hogql/database/schema/events.py`). Reliability on
  `target="_blank"` is good because the page is not unloaded; same-tab navigation falls back to
  `sendBeacon` at unload.
- `usePreviewDomGuard` must strip the new attribute prefix instead of `data-pirsch-*`; adding
  `ph-no-capture` on the preview root is the PostHog-native equivalent (`autocapture.ts`,
  `explicitNoCapture`).

### 4.2 Explicit `posthog.capture()`

Only needed if named events are wanted. The buttons are server components, so this means a small
`'use client'` wrapper with `onClick` or a delegated document listener (a DIY pattern; PostHog
documents neither delegation nor server-component capture beyond "use a client component"). For
pre-navigation critical events use `{ transport: 'sendBeacon', send_instantly: true }`
([docs/libraries/js/usage](https://posthog.com/docs/libraries/js/usage)). Naming guidance if we go
there: lowercase snake_case, `category:object_action`; `$`-prefixed names are reserved
([docs/product-analytics/best-practices](https://posthog.com/docs/product-analytics/best-practices)).
Limits: events over 1 MB are discarded; batch bodies < 20 MB
([docs/data/ingestion-warnings](https://posthog.com/docs/data/ingestion-warnings)).

Recommend §4.1 for slice 1. The existing `PIRSCH_EVENTS` constant renames to a vendor-neutral
`ANALYTICS_EVENTS`; the values stay so the event vocabulary is unchanged.

---

## 5. Reading back: Query API, HogQL, auth, limits, cost

### 5.1 Endpoint

`POST https://eu.posthog.com/api/projects/:project_id/query/` with
`{"query": {"kind": "HogQLQuery", "query": "...", "values": {...}}, "name": "..."}`; response has
`results`, `columns`, `types`, `hasMore`, `hogql`, `is_cached`, `query_status`
([docs/api/queries](https://posthog.com/docs/api/queries); `frontend/src/queries/schema/schema-general.ts`).
`values` binds `{placeholders}` server-side, so the tenant and dates are never string-interpolated.
Default 100 rows, up to 50,000 with `LIMIT`; `OFFSET` is rejected (400) for personal API keys —
paginate by keyset. `refresh: 'async'` + `GET …/query/:query_id/` for polling. **10 s max execution
time**, 3 concurrent queries per project. Always set `name` for `query_log` traceability.

### 5.2 HogQL

Per Campaign × Task, one tenant, one date range — the primary report query. Uses session-entry
attribution so a click after navigation still attributes; `properties.$host` and `properties.conference`
both work as the tenant filter (§2):

```sql
SELECT
  coalesce(session.$entry_utm_campaign, '(none)')       AS campaign,
  coalesce(session.$entry_utm_content,  '(none)')       AS task,
  any(session.$channel_type)                             AS channel_type,
  uniq(events.$session_id)                               AS sessions,
  countIf(event = '$pageview')                           AS pageviews,
  countIf(event = '$autocapture' AND properties.cta = 'cta-tickets-hero')              AS cta_tickets_hero,
  countIf(event = '$autocapture' AND properties.cta = 'outbound-checkin-tickets-page') AS checkout_clicks
FROM events
WHERE properties.conference = {conference}
  AND timestamp >= toDateTime({date_from}) AND timestamp < toDateTime({date_to})
GROUP BY campaign, task
ORDER BY sessions DESC
LIMIT 1000
```

`session` is a lazy join on `events.$session_id` (`posthog/hogql/database/schema/events.py`), so no
explicit JOIN. Outside cookieless mode the join-free form is cheaper:
`properties.$session_entry_utm_campaign` / `$session_entry_utm_content` in place of `session.$entry_*`.
The same-tab last-touch form uses `properties.utm_campaign` / `properties.utm_content` directly.

Distinct campaigns seen (for reconciling against the plan):

```sql
SELECT session.$entry_utm_campaign AS campaign, uniq(events.$session_id) AS sessions,
       min(timestamp) AS first_seen, max(timestamp) AS last_seen
FROM events
WHERE properties.conference = {conference} AND timestamp >= now() - INTERVAL 90 DAY
  AND isNotNull(session.$entry_utm_campaign)
GROUP BY campaign ORDER BY sessions DESC LIMIT 500
```

Notes: date literals parse in the **project timezone** ([docs/sql/expressions](https://posthog.com/docs/sql/expressions));
`uniq(person_id)` is meaningless for anonymous traffic (and daily-rotating under cookieless), so use
sessions as the denominator; do not query the `sessions` table directly for a tenant — it has no
`$host`/`conference` column, only `$entry_current_url`.

### 5.3 Auth, rate limits

- **Personal API key** (`phx_`), scope `query:read`, can be **project-scoped**; max 10 per account;
  header `Authorization: Bearer phx_…` ([docs/api/personal-api-keys](https://posthog.com/docs/api/personal-api-keys),
  [docs/api/queries](https://posthog.com/docs/api/queries)). The project token (`phc_`) is public and
  write-only. The newer **project secret key** (`phs_`) is server-to-server but its allowed scopes are
  only `endpoint:read`, `feature_flag:read`, `account:read`, `experiment:read`, `loop:write`
  (`posthog/scopes.py`, `PROJECT_SECRET_API_KEY_ALLOWED_API_SCOPE_ACTION`) — so raw HogQL needs a
  personal key tied to a user account. The way to a non-user credential is PostHog **Endpoints**: a
  saved, versioned, parameterised SQL query run via
  `POST /api/environments/:id/endpoints/:name/run` with a `phs_` key
  ([docs/endpoints/surfaces/api](https://posthog.com/docs/endpoints/surfaces/api)); its rate limits
  and pricing were not verifiable (§8).
- **Repo fit:** a new `analytics` secret family in `src/lib/secrets/types.ts` (`{ projectId, apiKey }`,
  env `TENANT_<SLUG>_ANALYTICS_API_KEY` / `…_PROJECT_ID`) exactly as the Pirsch research proposed —
  the public project token can stay on the conference document in place of `analyticsPirschCode`.
  Read through a `MarketingAnalyticsProvider` adapter per `docs/INTEGRATION_ADAPTERS.md`, called from
  a cron or on demand from the Marketing Report. `posthog-node` has no read methods; plain `fetch`
  with hand-typed `HogQLQueryResponse<T>` is the whole client.
- **Limits** ([docs/api](https://posthog.com/docs/api), [docs/api/queries](https://posthog.com/docs/api/queries)):
  query endpoint 240/min and 2,400/hour per project, 3 concurrent, 10 s timeout; ClickHouse read
  budget 20 GB/hour on free, 200 GB/hour on paid, 429 `api_queries_budget_exceeded` when exhausted,
  `Retry-After` and `X-PostHog-Query-Budget-Remaining-Bytes` headers. A per-conference report of a
  handful of grouped aggregations is nowhere near any of these.

### 5.4 Cost at this site's volume (2026-09-13, [pricing](https://posthog.com/pricing))

- Product analytics (web analytics is billed as the same events): **first 1,000,000 events/month
  free**, then $0.00005/event to 2M, $0.0000343 to 15M, decreasing. Identified events add a second
  line ("person profiles"): free to 1M, then $0.000198/event on top — ~5× an anonymous event in the
  1–2M band. Cookieless + `identified_only` keeps everything anonymous.
- Platform: Free = 1 project, 1-year retention, community support; pay-as-you-go ($0/month base,
  card on file) = 6 projects, 7-year retention; Boost $250/month and up = unlimited projects.
- Query API is available on the free plan (the read-budget table has a free tier). The SQL docs note
  the API "remains free during public beta, with competitive pricing planned post-launch"
  ([docs/sql](https://posthog.com/docs/sql)) — a future charge on query volume is signposted, not
  priced.
- Estimate: at ~50k events/month across tenants, **$0**; at 500k/month, **$0**; at 2M anonymous
  events/month, ~$50. Restricting autocapture (§4.1) keeps event counts close to pageviews + CTA clicks.
- Data pipelines (destinations) is a separate add-on: 10,000 trigger events + 1M rows free per month
  ([blog/data-pipeline-pricing](https://posthog.com/blog/data-pipeline-pricing)); `pricing.md` still
  shows an older per-event table — a live contradiction, verify in the billing UI if used.
- Retention: 1 year on Free. A Marketing Report that must outlive that needs snapshots on our side
  (or the $0 pay-as-you-go plan's 7 years).

Freshness: events are visible in Live within seconds; no documented SLA for HogQL queryability
([docs/web-analytics/live](https://posthog.com/docs/web-analytics/live)). A cron should not query
right up to `now()`.

---

## 6. Outbound checkout: Checkin.no and Tito

- **No Tito or Checkin.no source/destination exists.** PostHog's ticketing sources are Eventbrite,
  pretix and Ticket Tailor, all warehouse syncs ([docs/cdp/sources](https://posthog.com/docs/cdp/sources)).
- **Click-through is free and better than in Pirsch.** `$external_click_url` on the autocaptured
  `outbound-checkin-tickets-page` click (§4.1) plus the session-entry UTM (§3) gives "sent to
  checkout by Task X" with no code. Report it as intent, as the Pirsch research already insisted.
- **Beyond click-through, the vendor split from `link-attribution.md` §4 is unchanged.** Checkin.no
  exposes no source/UTM/metadata carrier on orders (only `coupon`), so a confirmed Checkin purchase
  cannot be attributed to a Task without per-Campaign discount codes or an embedded form. Tito can
  carry it: `save-metadata-parameters="utm_*"` on the widget, `?source=` for pre-registered sources,
  and `GET /registrations` / `registration.finished` webhooks return `source` and `metadata`
  ([help.tito.io/…/webhooks](https://help.tito.io/en/articles/2011381-webhooks),
  [ti.to/docs/api/widget](https://ti.to/docs/api/widget)).
- **How a Tito purchase would land in PostHog.** Not via PostHog's incoming-webhook source: it is a
  feature preview PostHog itself steers away from, and its only auth is an exact-match
  `Authorization` header, so it cannot verify Tito's HMAC `Tito-Signature`
  ([docs/cdp/sources/incoming-webhooks](https://posthog.com/docs/cdp/sources/incoming-webhooks),
  [docs/cdp/source_webhooks/source-webhook](https://posthog.com/docs/cdp/source_webhooks/source-webhook)).
  Instead: our own route (we already have `/api/webhooks/*` for Checkin) verifies the signature and
  calls `posthog-node` `capture({ distinctId, event: 'tickets:order_complete', properties: { conference, utm_campaign, utm_content } })`
  with the UTM values read back from Tito metadata. In cookieless mode there is no stable
  `distinct_id` to round-trip, so the event is attributed by the **UTM values carried through Tito**,
  not by person stitching — which is fine for a per-Campaign count. (Outside cookieless mode
  `posthog.get_distinct_id()` could be appended to the Tito link and stitched; PostHog has no
  automatic cross-domain parameter, only the manual `bootstrap` pattern
  ([tutorials/cross-domain-tracking](https://posthog.com/tutorials/cross-domain-tracking)).)
- **Destinations** (Slack, generic webhook) can alert on an Action such as "checkout click" if
  wanted ([docs/cdp/destinations/webhook](https://posthog.com/docs/cdp/destinations/webhook)); not
  needed for the report.
- Web analytics **conversion goals** accept a custom event or Action and show conversions and
  conversion rate on the dashboard ([docs/web-analytics/conversion-goals](https://posthog.com/docs/web-analytics/conversion-goals));
  whether each UTM row shows its own rate could not be confirmed (§8) — the HogQL in §5.2 does not
  depend on it.

---

## 7. Recommendation

1. **Setup.** EU-cloud project (one for the platform), `instrumentation-client.ts` init behind
   Next.js rewrites on a non-obvious path, `defaults: '2026-05-30'`, `cookieless_mode: 'always'`
   (+ project setting), `person_profiles: 'identified_only'`, no replay/surveys, autocapture
   allowlisted to `[data-ph-capture-attribute-cta]` clicks. `conference.analyticsPirschCode` becomes
   `analyticsPosthogToken` (public `phc_` token, same "absent = no script" policy); the privacy page
   and `SubprocessorList` swap Pirsch for PostHog.
2. **Tenant.** `register({ conference })` in `loaded`; `$host` as a cross-check. No groups.
3. **UTM.** Keep the scheme from `link-attribution.md`; add a custom channel rule for `bluesky`.
4. **Events.** Rename `data-pirsch-event` → `data-ph-capture-attribute-cta`, `data-pirsch-meta-*` →
   `data-ph-capture-attribute-*`; `PIRSCH_EVENTS` → `ANALYTICS_EVENTS`; update `usePreviewDomGuard`.
5. **Read-back.** An `analytics` secret family holding a project-scoped personal API key
   (`query:read`) and the project id; a small adapter doing `fetch` against `/api/projects/:id/query/`
   with the §5.2 HogQL and `values` binding; results keyed by `(utm_campaign, utm_content)` = (Campaign,
   Task). Consider migrating the query to a PostHog Endpoint + `phs_` key once that product's limits
   are documented.
6. **Outbound.** Report `$external_click_url` clicks as checkout intent. Tito purchase attribution via
   UTM-in-metadata + our own webhook route is the follow-up; Checkin.no still needs discount codes.
7. **Before building:** the empirical check in §8 item 1.

---

## 8. What could not be verified

1. **Cookieless mode × session-entry attribution.** With `cookieless_mode: 'always'` the client
   sends no `$session_id` / `$session_entry_*` (source, §1.4). Whether the server-assigned sessions
   populate `session.$entry_utm_*` for HogQL is not stated in the docs. One tagged URL, one CTA
   click, one query settles it. If it fails, `properties.utm_*` (memory super properties) still
   covers the same-page-load case, which is the "Task links to the CTA page" policy.
2. Whether cookieless server hash mode is GA or beta, and whether it carries any charge — no doc
   page says either.
3. Endpoints product: rate limits, caching, pricing. Insights API `?refresh=` semantics.
4. Post-beta pricing of the Query API (signposted, unpriced). Whether batch exports need the data
   pipelines add-on. The data-pipelines pricing contradiction between the blog and `pricing.md`.
5. Ingestion-to-queryable latency has no documented number.
6. Whether the web analytics UTM tiles show per-row conversion rates for a conversion goal.
7. Docs vs source drift noticed: docs list `$el_href` (not in source; `attr__href` /
   `$external_click_url` are real); docs say `cross_subdomain_cookie` defaults `true` (source
   computes it, `false` on `vercel.app`); `mask_personal_data_properties`, `save_campaign_params` and
   `register_for_session` are undocumented on posthog.com and were read from source. The LinkedIn
   click id is `li_fat_id`.
8. Tito: whether `save-metadata-parameters` works on a hosted checkout URL without the widget, and
   whether `registration.finished` payloads include `metadata` (the help-centre example omits it).
   Carried over from `link-attribution.md` §6.
