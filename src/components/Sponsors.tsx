import { Container } from '@/components/Container'
import { SponsorLogo } from '@/components/SponsorLogo'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { ConferenceSponsor } from '@/lib/sponsor/types'
import { Conference } from '@/lib/conference/types'
import {
  groupSponsorsByTier,
  getDailySeed,
  deterministicShuffle,
  sortTierNamesByValue,
} from '@/lib/sponsor/utils'
import Link from 'next/link'
import { PIRSCH_EVENTS } from '@/lib/analytics'
import {
  DEFAULT_SPONSORS_CTA_DESCRIPTION,
  DEFAULT_SPONSORS_CTA_HEADING,
  DEFAULT_SPONSORS_DESCRIPTION,
  DEFAULT_SPONSORS_HEADING,
} from '@/lib/homepage/sections'
import { resolveVariant, type SectionVariant } from '@/lib/homepage/variants'

/**
 * One logo cell: the house dashed-grid tile wrapping an outbound sponsor link.
 * Shared by both variants so the link semantics (new tab, `noopener`, the
 * "Visit X website" label) can never drift between them; only the tile and
 * logo sizing differ, and the `tiers` caller passes exactly the classes the
 * pre-variant markup used.
 */
function SponsorCell({
  sponsor,
  className,
  logoClassName,
}: {
  sponsor: ConferenceSponsor
  className: string
  logoClassName: string
}) {
  return (
    <div className={className}>
      <a
        href={sponsor.sponsor.website}
        className="block rounded transition-opacity hover:opacity-75 focus:opacity-75 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visit ${sponsor.sponsor.name} website`}
      >
        <SponsorLogo
          logo={sponsor.sponsor.logo}
          logoBright={sponsor.sponsor.logoBright}
          name={sponsor.sponsor.name}
          className={logoClassName}
        />
      </a>
    </div>
  )
}

/**
 * The "Become a Sponsor" card. Deliberately IDENTICAL in every variant: it is a
 * conversion surface carrying tenant-configured copy (`ctaHeading` /
 * `ctaDescription`), not an artefact of the tier layout, and `showCta` stays an
 * independent field. A variant changes how sponsors are *displayed*; it must not
 * silently retire the pitch or drop copy an organizer wrote.
 */
function SponsorsCta({
  conference,
  ctaHeading,
  ctaDescription,
}: {
  conference: Conference
  ctaHeading: string
  ctaDescription: string
}) {
  return (
    <div className="mt-20 text-center">
      <div className="rounded-2xl bg-linear-to-r from-brand-cloud-blue/10 to-brand-fresh-green/10 p-8 md:p-12">
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:text-left">
          <div className="shrink-0">
            <ConferenceLogo
              conference={conference}
              variant="mark"
              className="h-72 w-72 text-brand-cloud-blue/20 dark:text-white/20"
            />
          </div>
          <div className="flex-1">
            <h3 className="font-space-grotesk mb-4 text-2xl font-bold tracking-tight text-brand-slate-gray md:text-3xl">
              {ctaHeading}
            </h3>
            <p className="font-inter mx-auto mb-8 max-w-2xl text-lg text-brand-slate-gray sm:mx-0">
              {ctaDescription}
            </p>
            {conference.sponsorTiers && conference.sponsorTiers.length > 0 ? (
              <Link
                href="/sponsor"
                className="inline-flex items-center justify-center rounded-lg bg-brand-cloud-blue px-8 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none dark:bg-brand-cloud-blue dark:hover:bg-brand-cloud-blue-hover dark:focus:ring-offset-gray-800"
                data-pirsch-event={PIRSCH_EVENTS.sponsorSection}
              >
                View Sponsorship Packages
              </Link>
            ) : (
              <a
                href={`mailto:${conference.sponsorEmail}?subject=Sponsorship Inquiry`}
                className="inline-flex items-center justify-center rounded-lg bg-brand-cloud-blue px-8 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none dark:bg-brand-cloud-blue dark:hover:bg-brand-cloud-blue-hover dark:focus:ring-offset-gray-800"
                data-pirsch-event={PIRSCH_EVENTS.sponsorSection}
              >
                Contact Us About Sponsoring
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Sponsors({
  sponsors,
  conference,
  showCTA = true,
  variant,
  heading = DEFAULT_SPONSORS_HEADING,
  description = DEFAULT_SPONSORS_DESCRIPTION,
  ctaHeading = DEFAULT_SPONSORS_CTA_HEADING,
  ctaDescription = DEFAULT_SPONSORS_CTA_DESCRIPTION,
}: {
  sponsors: ConferenceSponsor[]
  conference: Conference
  showCTA?: boolean
  /**
   * Presentation variant. ABSENT = `tiers`, the pre-variant rendering — which
   * is what every non-homepage caller (the programme page, the sponsor
   * prospectus) gets without changing a line.
   */
  variant?: SectionVariant<'homepageSponsors'>
  /** Band heading. Defaults to the house copy (`homepageSponsors` config). */
  heading?: string
  /** Band sub-heading. Defaults to the house copy. */
  description?: string
  /** "Become a Sponsor" card heading. Defaults to the house copy. */
  ctaHeading?: string
  /** "Become a Sponsor" card body. Defaults to the house copy. */
  ctaDescription?: string
}) {
  const resolvedVariant = resolveVariant('homepageSponsors', variant)

  const hasSponsors = sponsors && sponsors.length > 0

  const groupedSponsors = hasSponsors ? groupSponsorsByTier(sponsors) : {}

  const dailySeed = getDailySeed()

  Object.keys(groupedSponsors).forEach((tierName) => {
    const tierSeed = dailySeed + tierName.charCodeAt(0) * 1000
    groupedSponsors[tierName] = deterministicShuffle(
      groupedSponsors[tierName],
      tierSeed,
    )
  })

  const sortedTierNames = sortTierNamesByValue(
    Object.keys(groupedSponsors),
    conference.sponsorTiers || [],
  )

  /**
   * `logo-wall`: every sponsor in ONE grid, at ONE size, with no tier headings
   * and no tier rail — the promise of equal billing, and the honest look for a
   * young event whose sponsors all sit in one de-facto tier (today that renders
   * as a lone tier label over a short row, which reads as emptiness).
   *
   * WHAT HAPPENS TO THE TIER NAMES: they disappear from the page entirely —
   * from the visual layer AND from the accessibility layer, because announcing
   * a hierarchy to screen-reader users that sighted users cannot see would be a
   * worse kind of inequality. Tier VALUE survives as the ordering key only
   * (highest tier first), with the same daily deterministic shuffle applied
   * within each tier, so the house fairness rotation is preserved and no
   * sponsor is permanently first. Tierless sponsors stay unpublished — that is
   * a publication rule (`groupSponsorsByTier`), not a presentation one.
   */
  const flatSponsors = sortedTierNames.flatMap(
    (tierName) => groupedSponsors[tierName],
  )

  return (
    <section id="sponsors" aria-label="Sponsors" className="py-20 sm:py-32">
      <Container>
        {hasSponsors && (
          <div className="mb-20">
            <div className="mx-auto max-w-2xl lg:mx-0">
              <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl">
                {heading}
              </h2>
              <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
                {description}
              </p>
            </div>
          </div>
        )}

        {hasSponsors && resolvedVariant === 'tiers' && (
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            {sortedTierNames.map((tierName) => {
              const tierSponsors = groupedSponsors[tierName]

              return (
                <div
                  key={tierName}
                  className="mb-12 last:mb-0 lg:relative lg:mb-0"
                >
                  <div className="mb-6 flex items-start gap-3 lg:absolute lg:top-8 lg:left-0 lg:mb-0 lg:w-32">
                    <div className="mt-2 h-0.5 w-4 shrink-0 bg-brand-cloud-blue dark:bg-brand-cloud-blue"></div>
                    <h3 className="font-display text-lg font-bold tracking-wider text-brand-cloud-blue uppercase dark:text-brand-cloud-blue">
                      {tierName}
                    </h3>
                  </div>

                  <div className="lg:ml-40">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                      {tierSponsors.map((sponsor, i) => (
                        <SponsorCell
                          key={`${sponsor.sponsor.name}-${i}`}
                          sponsor={sponsor}
                          className="-mr-px -mb-px flex min-h-25 items-center justify-center border-2 border-dashed border-gray-400 bg-white p-6 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-transparent dark:hover:bg-gray-800/30"
                          logoClassName="h-8 w-auto max-w-full object-contain sm:h-10 lg:h-8"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {hasSponsors && resolvedVariant === 'logo-wall' && (
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            {/* Fewer columns and a taller cell than the tiered grid: with the
                tier rail gone the wall spans the full width, so the logos get
                the room the hierarchy used to take. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {flatSponsors.map((sponsor, i) => (
                <SponsorCell
                  key={`${sponsor.sponsor.name}-${i}`}
                  sponsor={sponsor}
                  className="-mr-px -mb-px flex min-h-32 items-center justify-center border-2 border-dashed border-gray-400 bg-white p-4 transition-colors hover:bg-gray-50 sm:min-h-36 sm:p-6 dark:border-gray-600 dark:bg-transparent dark:hover:bg-gray-800/30"
                  logoClassName="h-10 w-auto max-w-full object-contain sm:h-12"
                />
              ))}
            </div>
          </div>
        )}

        {showCTA && (
          <SponsorsCta
            conference={conference}
            ctaHeading={ctaHeading}
            ctaDescription={ctaDescription}
          />
        )}
      </Container>
    </section>
  )
}
