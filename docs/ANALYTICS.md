# Web analytics (PostHog)

Per-organization PostHog web analytics, replacing Pirsch (issue #1008; design in
`docs/MARKETING_PLAN_SPEC.md` §6.1; consent decision in #1034).

## Cutover, per organization

| Organization document       | Conference document       | What the site serves                  |
| --------------------------- | ------------------------- | ------------------------------------- |
| `analyticsPosthogToken` set | anything                  | PostHog + consent bar; Pirsch ignored |
| no token                    | `analyticsPirschCode` set | Pirsch pageviews only (legacy)        |
| no token                    | no code                   | nothing                               |

The token is edited in **Admin → Settings → Analytics** (organization half of
the card; `organization.updateAnalytics`). One PostHog project per organization;
the `conference` super property (the conference document `_id`) separates
editions inside it. The Pirsch field and script are removed once every
organization has switched.

## Client wiring

- `instrumentation-client.ts` → `src/lib/posthog/init.ts`: waits for the gate
  element `#tenant-analytics` (rendered by `TenantAnalytics` in
  `src/app/layout.tsx` only when the organization has a token; it streams in
  after the shell), validates `data-token` / `data-conference`, then
  `posthog.init` with the options from `src/lib/posthog/config.ts`.
- Not under admin or speaker routes: the entry does not init on `/admin*`,
  `/cfp/*` (the speaker portal; the public `/cfp` landing page counts) or
  `/notifications`. Opened on one of those, it waits for `AnalyticsRouteGate`
  to report a client-side navigation onto a public path; the opposite
  direction is covered by `before_send`, which drops events captured on an
  excluded path.
- Ingestion is proxied: the browser posts to `POSTHOG_INGEST_PATH`
  (`src/lib/posthog/ingest.ts`) and `next.config.ts` rewrites it to
  `eu.i.posthog.com` / `eu-assets.i.posthog.com`. PostHog's paths carry
  trailing slashes, so the automatic trailing-slash redirect is off and
  re-added by hand for every other path; the service worker never caches the
  proxy path.
- Init options: `defaults: '2026-05-30'`, `cookieless_mode: 'on_reject'` +
  `opt_out_capturing_by_default: true` (hybrid: pending and declining visitors
  are counted cookielessly with a daily-salted server hash), identified-only
  person profiles, replay and surveys off, autocapture allowlisted to clicks
  on `[data-ph-capture-attribute-cta]`, `before_send` drops events from the
  excluded routes above. The consent choice is stored in a host-only cookie
  (`opt_out_capturing_persistence_type: 'cookie'`, `cross_subdomain_cookie:
false`) so it expires after one year and is per site domain.
- Project settings that must be on: _Web analytics → cookieless_ (serves the
  pending/declined cohort), _Discard client IP data_; replay and surveys off.
  Add each new edition's host to _Authorized URLs_ at launch.

## Consent (#1034)

`AnalyticsConsentBar` (root layout, public routes only) shows while
`get_explicit_consent_status()` is `pending`. **Accept** runs
`opt_in_capturing()`, then re-registers `conference` and
`register_for_session` with the landing URL's `utm_*` — opt-in starts a new
client session and drops pre-consent super properties, so without this bridge an
accepting visitor's CTA clicks would carry no campaign (#1000). The `$opt_in`
event fires inside `opt_in_capturing()` before that re-register, so it is
given `conference` explicitly; the SDK captures no second `$pageview` after
opt-in, so an accepting visitor's cookie session starts with `$opt_in` and
attribution continues from their next navigation or click. **Decline** runs
`opt_out_capturing()` and re-registers `conference` (revoking an earlier Accept
resets persistence); the SDK persists the choice for one year. The privacy
page's cookies section carries `AnalyticsChoice` to change it later; the
footer's "Cookie settings" link points there.

## CTA events

Marked buttons carry `data-ph-capture-attribute-cta="<name>"` (plus
`data-ph-capture-attribute-position` where a section repeats a button). The
catalogue is `ANALYTICS_EVENTS` in `src/lib/analytics.ts`; a click arrives as
`$autocapture` with `properties.cta = "<name>"`. Outbound checkout clicks also
carry `$external_click_url`. The admin composer preview strips every
`data-ph-capture-attribute-*` attribute (`usePreviewDomGuard`) so organizer
clicks never count.

### Actions to create in the project

Create one **Action** per name (PostHog → Data management → Actions), match type
_Autocapture_, filter `cta` **equals** the name. They give the named insights
their vocabulary; the attribution query (spec §6.2) reads `properties.cta`
directly and does not depend on them.

| Action name                       | Element                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `cta-tickets-header`              | Header "Get your ticket"                                 |
| `cta-tickets-hero`                | Hero tickets button                                      |
| `cta-program-hero`                | Hero "View Program"                                      |
| `cta-cfp-hero`                    | Hero "Submit to Speak"                                   |
| `cta-sponsor-hero`                | Hero "Become a Sponsor"                                  |
| `cta-info-hero`                   | Hero "Practical Info"                                    |
| `cta-tickets-program-highlights`  | ProgramHighlights tickets (`position`: standouts/footer) |
| `cta-program-program-highlights`  | ProgramHighlights program (`position`: standouts/footer) |
| `cta-speakers-program-highlights` | ProgramHighlights "Meet All Speakers"                    |
| `cta-cfp-callToAction`            | CallToAction "Submit Your Talk"                          |
| `cta-tickets-callToAction`        | CallToAction "Reserve Your Ticket"                       |
| `cta-sponsor-section`             | Sponsors section CTA                                     |
| `cta-cfp-featured-speakers`       | Featured Speakers "Submit a talk"                        |
| `cta-tickets-featured-speakers`   | Featured Speakers tickets                                |
| `cta-info-featured-speakers`      | Featured Speakers info                                   |
| `cta-program-featured-speakers`   | Featured Speakers programme / recordings                 |
| `cta-cfp-featured-organizers`     | Organizers "Submit a talk"                               |
| `cta-tickets-featured-organizers` | Organizers tickets                                       |
| `cta-info-featured-organizers`    | Organizers info                                          |
| `cta-program-featured-organizers` | Organizers programme / recordings                        |
| `outbound-checkin-tickets-page`   | /tickets external registration (outbound)                |

Three roll-up Actions are useful for the marketing report: `cta` **contains**
`cta-cfp-`, `cta-sponsor-`, and `outbound-`.

## Data declared on /privacy

`src/lib/legal/subprocessors.ts` discloses PostHog (EU Cloud, Frankfurt) when
the organization has a token and Pirsch only while it has none; with the
organization read failing and a code stored, both are listed as _possible_.
The privacy page's analytics wording switches with the same signal.
