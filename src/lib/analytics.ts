/**
 * Conversion-tracking CTA events.
 *
 * Events are attached declaratively with `data-ph-capture-attribute-cta="<name>"`
 * attributes. PostHog autocapture (`instrumentation-client.ts`) is allowlisted
 * to exactly that selector, so a click on a marked element arrives as an
 * `$autocapture` event carrying `cta: "<name>"` — plus one property per extra
 * `data-ph-capture-attribute-<key>="<value>"` attribute (`position` today).
 * See https://posthog.com/docs/product-analytics/autocapture#capturing-additional-properties-from-elements
 *
 * Naming scheme: `cta-<intent>-<location>` for internal conversion links and
 * `outbound-<destination>-<location>` for external links. The attribution
 * query (docs/MARKETING_PLAN_SPEC.md §6.2) groups on the `cta-cfp-`,
 * `cta-sponsor-` and `outbound-` prefixes, so the prefixes are load-bearing.
 *
 * Every name below has a matching PostHog Action in the project — see
 * docs/ANALYTICS.md for the list to create.
 *
 * Full list of event names:
 * - `cta-tickets-header`              Header "Get your ticket" button
 * - `cta-tickets-hero`                Hero tickets ActionButton
 * - `cta-program-hero`                Hero "View Program" ActionButton
 * - `cta-cfp-hero`                    Hero "Submit to Speak" ActionButton
 * - `cta-sponsor-hero`                Hero "Become a Sponsor" ActionButton
 * - `cta-info-hero`                   Hero "Practical Info" ActionButton
 * - `cta-tickets-program-highlights`  ProgramHighlights ticket buttons
 *                                     (`position`: `standouts` | `footer`)
 * - `cta-program-program-highlights`  ProgramHighlights program buttons
 *                                     (`position`: `standouts` | `footer`)
 * - `cta-speakers-program-highlights` ProgramHighlights "Meet All Speakers"
 * - `cta-cfp-callToAction`            CallToAction "Submit Your Talk" button
 * - `cta-tickets-callToAction`        CallToAction "Reserve Your Ticket" button
 * - `cta-sponsor-section`             Sponsors section CTA (packages/contact)
 * - `cta-cfp-featured-speakers`       Featured Speakers section "Submit a talk"
 * - `cta-tickets-featured-speakers`   Featured Speakers section tickets button
 * - `cta-info-featured-speakers`      Featured Speakers section info button
 * - `cta-program-featured-speakers`   Featured Speakers section programme button
 *                                     ("See the programme" / "Watch the talks")
 * - `cta-cfp-featured-organizers`     Organizers section "Submit a talk"
 * - `cta-tickets-featured-organizers` Organizers section tickets button
 * - `cta-info-featured-organizers`    Organizers section info button
 * - `cta-program-featured-organizers` Organizers section programme button
 *                                     ("See the programme" / "Watch the talks")
 * - `outbound-checkin-tickets-page`   /tickets external registration button
 *                                     (outbound to checkin.no)
 */

/**
 * The attribute prefix PostHog autocapture turns into event properties:
 * `data-ph-capture-attribute-<key>="<value>"` becomes `{ <key>: "<value>" }`.
 */
export const CAPTURE_ATTR_PREFIX = 'data-ph-capture-attribute-'

/** The one attribute that marks a CTA. Its value is the event name above. */
export const CTA_CAPTURE_ATTR = `${CAPTURE_ATTR_PREFIX}cta`

/**
 * Per-organization PostHog identification (issue #1008).
 *
 * The PUBLIC project token (`phc_…`) lives on `organization.analyticsPosthogToken`
 * and is edited in Admin → Settings → Analytics. ABSENT means no PostHog init
 * at all; there is no platform-level env fallback, because the only other
 * default is collecting a tenant's traffic into a project they do not own.
 *
 * A valid organization token enables PostHog; without one, no analytics loads.
 */

/**
 * PostHog project tokens are `phc_` followed by a fixed-length alphanumeric
 * body. The value is serialised into the page and interpolated into a request
 * path, so the shape is pinned here rather than trusted: no punctuation, and
 * never a personal `phx_` key.
 */
const POSTHOG_TOKEN_RE = /^phc_[A-Za-z0-9]{20,64}$/

/** Normalize a stored token to either a usable token or `undefined`. */
export function resolvePosthogToken(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return POSTHOG_TOKEN_RE.test(trimmed) ? trimmed : undefined
}

/** Shared message for the admin/Studio validation of the token. */
export const POSTHOG_TOKEN_MESSAGE =
  'Enter the public project token from PostHog (starts with "phc_").'

/** Exported for the write-path validators so the shape is defined exactly once. */
export const POSTHOG_TOKEN_PATTERN = POSTHOG_TOKEN_RE

export const ANALYTICS_EVENTS = {
  ticketsHeader: 'cta-tickets-header',
  ticketsHero: 'cta-tickets-hero',
  programHero: 'cta-program-hero',
  cfpHero: 'cta-cfp-hero',
  sponsorHero: 'cta-sponsor-hero',
  infoHero: 'cta-info-hero',
  ticketsProgramHighlights: 'cta-tickets-program-highlights',
  programProgramHighlights: 'cta-program-program-highlights',
  speakersProgramHighlights: 'cta-speakers-program-highlights',
  cfpCallToAction: 'cta-cfp-callToAction',
  ticketsCallToAction: 'cta-tickets-callToAction',
  sponsorSection: 'cta-sponsor-section',
  cfpFeaturedSpeakers: 'cta-cfp-featured-speakers',
  ticketsFeaturedSpeakers: 'cta-tickets-featured-speakers',
  infoFeaturedSpeakers: 'cta-info-featured-speakers',
  programFeaturedSpeakers: 'cta-program-featured-speakers',
  cfpFeaturedOrganizers: 'cta-cfp-featured-organizers',
  ticketsFeaturedOrganizers: 'cta-tickets-featured-organizers',
  infoFeaturedOrganizers: 'cta-info-featured-organizers',
  programFeaturedOrganizers: 'cta-program-featured-organizers',
  outboundCheckinTicketsPage: 'outbound-checkin-tickets-page',
} as const
