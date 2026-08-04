/**
 * Pirsch custom click events for conversion tracking.
 *
 * Events are attached declaratively with `data-pirsch-event="<name>"`
 * attributes, which the standard `pa.js` snippet in `src/app/layout.tsx`
 * picks up automatically for click events — no extended script or client
 * component is required. Optional metadata can be attached with
 * `data-pirsch-meta-<key>="<value>"` attributes.
 * See https://docs.pirsch.io/advanced/events
 *
 * Naming scheme: `cta-<intent>-<location>` for internal conversion links and
 * `outbound-<destination>-<location>` for external links.
 *
 * Full list of event names:
 * - `cta-tickets-header`              Header "Get your ticket" button
 * - `cta-tickets-hero`                Hero tickets ActionButton
 * - `cta-program-hero`                Hero "View Program" ActionButton
 * - `cta-cfp-hero`                    Hero "Submit to Speak" ActionButton
 * - `cta-sponsor-hero`                Hero "Become a Sponsor" ActionButton
 * - `cta-info-hero`                   Hero "Practical Info" ActionButton
 * - `cta-tickets-program-highlights`  ProgramHighlights ticket buttons
 *                                     (meta `position`: `standouts` | `footer`)
 * - `cta-program-program-highlights`  ProgramHighlights program buttons
 *                                     (meta `position`: `standouts` | `footer`)
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
 * Per-tenant analytics identification.
 *
 * The Pirsch site code used to be a STRING LITERAL in `src/app/layout.tsx`,
 * injected on every host the platform serves. That is a data-ownership problem,
 * not a styling one: every tenant's pageviews landed in one property that none
 * of them owns, and every tenant's privacy policy disclosed a processor
 * receiving traffic the tenant cannot read.
 *
 * It is now `conference.analyticsPirschCode` — a per-conference field an
 * organizer sets in Admin → Settings → Analytics. When it is ABSENT, NO
 * analytics script is rendered at all. There is deliberately no platform-level
 * env fallback: "no analytics" is the only safe default, because the only other
 * option is somebody else's property.
 *
 * The `data-pirsch-event` attributes scattered across the components are inert
 * without the script, so leaving them in place costs nothing and means a tenant
 * that pastes in their own code immediately gets the full conversion funnel.
 */

/**
 * Pirsch identification codes are opaque, fixed-length alphanumeric strings
 * (32 chars in every code Pirsch issues today). We accept a slightly wider
 * alphanumeric shape rather than pinning the length, but REJECT anything with
 * quotes, angle brackets, whitespace or other punctuation: the value is
 * interpolated into an attribute on a `<script>` tag, so a permissive filter
 * here is the difference between a config field and an injection point.
 */
const PIRSCH_CODE_RE = /^[A-Za-z0-9]{8,64}$/

/**
 * Normalize a stored analytics code to either a usable code or `undefined`.
 * Absent, blank or malformed values all resolve to `undefined`, i.e. no script.
 */
export function resolvePirschCode(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return PIRSCH_CODE_RE.test(trimmed) ? trimmed : undefined
}

/** Shared message for the admin/Studio validation of the analytics code. */
export const PIRSCH_CODE_MESSAGE =
  'Enter the identification code from your Pirsch dashboard (letters and digits only).'

/** Exported for the write-path validators so the shape is defined exactly once. */
export const PIRSCH_CODE_PATTERN = PIRSCH_CODE_RE

export const PIRSCH_EVENTS = {
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
