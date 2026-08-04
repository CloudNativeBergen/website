import {
  DEFAULT_FAQ_HEADING,
  DEFAULT_FEATURED_SPEAKERS_HEADING,
  DEFAULT_GALLERY_DESCRIPTION,
  DEFAULT_GALLERY_HEADING,
  DEFAULT_ORGANIZERS_HEADING,
  DEFAULT_SAVE_THE_DATE_HEADING,
  DEFAULT_SPONSORS_CTA_DESCRIPTION,
  DEFAULT_SPONSORS_CTA_HEADING,
  DEFAULT_SPONSORS_DESCRIPTION,
  DEFAULT_SPONSORS_HEADING,
  DEFAULT_VENUE_HEADING,
  defaultFeaturedSpeakersDescription,
  defaultOrganizersDescription,
} from '@/lib/homepage/sections'

/**
 * WHAT THE PAGE PUTS THERE IF YOU LEAVE IT BLANK — the composer's config
 * placeholders.
 *
 * Every optional copy field on the front page has a house fallback, and until
 * now the input said none of it: "A line under the heading" told an organizer
 * that a line goes under the heading, which they could see, and nothing about
 * WHICH band they were editing or what their visitors read today. A placeholder
 * that quotes the real fallback answers both at once — "Meet the speakers at
 * Nordic Platform Days" is unmistakably the speakers band, and it is literally
 * what renders.
 *
 * THE FALLBACKS ARE IMPORTED, NEVER RETYPED. Every string here comes from
 * `lib/homepage/sections` — the same constants the band components render — so a
 * copy change lands in the placeholder in the same commit. The only strings
 * authored here are the ones describing an ABSENCE: where a field has no
 * fallback the page renders nothing, and saying "no heading — the numbers stand
 * on their own" is more honest than borrowing a heading from a neighbouring
 * band.
 *
 * Fallbacks BUILT from tenant data (the hero's tagline, the "Meet the speakers
 * at …" intros) are shown as a representative rendering with this conference's
 * own values, not as a template with a hole in it.
 */

/** The tenant facts the computed fallbacks are built from. */
export interface PlaceholderConference {
  title?: string
  tagline?: string
  /** Free text on the conference; may be absent on a young tenant. */
  description?: string
}

/**
 * Stand-in for a conference title that has not loaded yet (the workspace fetches
 * its tenant data client-side). Reads as a sentence rather than as a gap.
 */
const UNKNOWN_TITLE = 'your conference'

/**
 * What actually fits before the box clips it — measured at 393px, the narrowest
 * the rail gets, because a placeholder cut off by the input edge ends mid-word
 * with no ellipsis to say it was cut. One line of a single-line input is ~44
 * characters there; two textarea rows are ~80.
 */
export const HEADING_EXCERPT = 44
export const BODY_EXCERPT = 80

/**
 * The first {@link max} characters of `text`, cut at a word boundary and closed
 * with an ellipsis. Text that already fits is returned untouched — an excerpt
 * marker on a string that was not shortened would be a lie about the fallback.
 */
export function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  // A single word longer than the budget has no boundary to cut on; hard-cut it
  // rather than return the whole paragraph.
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:—-]$/, '')}…`
}

export interface ComposerPlaceholders {
  homepageHero: { heroHeadline: string; heroSubheadline: string }
  homepageSaveTheDate: { heading: string; description: string }
  homepageCtaBanner: { body: string }
  homepageRichText: { heading: string }
  homepageMetrics: { heading: string }
  homepageFaq: { heading: string }
  homepageCountdown: { heading: string; liveMessage: string }
  homepageFeaturedSpeakers: { heading: string; description: string }
  homepageOrganizers: { heading: string; description: string }
  homepageGallery: { heading: string; description: string }
  homepageSponsors: {
    heading: string
    description: string
    ctaHeading: string
    ctaDescription: string
  }
  homepageVenue: { heading: string; description: string }
}

/**
 * The placeholder for every optional copy field in the composer, resolved
 * against THIS conference.
 *
 * `conference` is undefined only while the workspace's own data query is in
 * flight; the computed fallbacks then name "your conference" rather than
 * flashing an empty template.
 */
export function composerPlaceholders(
  conference?: PlaceholderConference,
): ComposerPlaceholders {
  const title = conference?.title?.trim() || UNKNOWN_TITLE
  const tagline = conference?.tagline?.trim()
  // The hero's description column takes the conference description verbatim.
  //
  // The schema defines this field as `type: 'text'`, i.e. a plain string — an
  // earlier version of this comment claimed it could be Portable Text on some
  // tenants, which is not true of any schema in this repo. The `typeof` guard
  // stays anyway: this reads dataset content, and the Hero itself renders the
  // value only when it is a string, so a wrong-typed row must show "nothing
  // renders" here rather than a placeholder the page would not produce.
  const description =
    typeof conference?.description === 'string'
      ? conference.description.trim()
      : ''

  return {
    // Hero: an absent override falls through to the tagline and the conference
    // description (see `HeroHeadlineText` / `HeroDescription`), NOT to the
    // conference title — which is what the old "Your conference name"
    // placeholder promised and the page never did.
    homepageHero: {
      heroHeadline: tagline
        ? excerpt(tagline, HEADING_EXCERPT)
        : 'No headline — your tagline is empty',
      heroSubheadline: description
        ? excerpt(description, BODY_EXCERPT)
        : 'No text — your conference description is empty',
    },
    homepageSaveTheDate: {
      heading: DEFAULT_SAVE_THE_DATE_HEADING,
      description: 'No extra line — just the dates, venue and countdown',
    },
    homepageCtaBanner: {
      body: 'No body — just the heading and the button',
    },
    homepageRichText: {
      heading: 'No heading — the band starts with your text',
    },
    homepageMetrics: {
      heading: 'No heading — the numbers stand on their own',
    },
    homepageFaq: { heading: DEFAULT_FAQ_HEADING },
    homepageCountdown: {
      heading: 'No heading — the counter stands on its own',
      liveMessage: 'No message — the counter disappears',
    },
    homepageFeaturedSpeakers: {
      heading: DEFAULT_FEATURED_SPEAKERS_HEADING,
      description: excerpt(
        defaultFeaturedSpeakersDescription(title),
        BODY_EXCERPT,
      ),
    },
    homepageOrganizers: {
      heading: DEFAULT_ORGANIZERS_HEADING,
      description: excerpt(defaultOrganizersDescription(title), BODY_EXCERPT),
    },
    homepageGallery: {
      heading: DEFAULT_GALLERY_HEADING,
      description: excerpt(DEFAULT_GALLERY_DESCRIPTION, BODY_EXCERPT),
    },
    homepageSponsors: {
      heading: DEFAULT_SPONSORS_HEADING,
      description: excerpt(DEFAULT_SPONSORS_DESCRIPTION, BODY_EXCERPT),
      ctaHeading: DEFAULT_SPONSORS_CTA_HEADING,
      ctaDescription: excerpt(DEFAULT_SPONSORS_CTA_DESCRIPTION, BODY_EXCERPT),
    },
    homepageVenue: {
      heading: DEFAULT_VENUE_HEADING,
      description: 'No description — just the address and directions',
    },
  }
}
