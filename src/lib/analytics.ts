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
 * - `cta-cfp-featured-organizers`     Organizers section "Submit a talk"
 * - `cta-tickets-featured-organizers` Organizers section tickets button
 * - `cta-info-featured-organizers`    Organizers section info button
 * - `outbound-checkin-tickets-page`   /tickets external registration button
 *                                     (outbound to checkin.no)
 */
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
  cfpFeaturedOrganizers: 'cta-cfp-featured-organizers',
  ticketsFeaturedOrganizers: 'cta-tickets-featured-organizers',
  infoFeaturedOrganizers: 'cta-info-featured-organizers',
  outboundCheckinTicketsPage: 'outbound-checkin-tickets-page',
} as const
