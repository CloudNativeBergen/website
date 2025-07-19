'use client'
// Use client due to the use of InlineSvgPreviewComponent that renders SVGs

import { Container } from '@/components/Container'
import { ConferenceSponsor } from '@/lib/sponsor/types'
import { InlineSvgPreviewComponent } from '@starefossen/sanity-plugin-inline-svg-input'
import Link from 'next/link'

export function Sponsors({ sponsors }: { sponsors: ConferenceSponsor[] }) {
  // Separate standard and special sponsors, then group by tier
  const standardSponsors = sponsors.filter(
    (sponsor) =>
      sponsor.tier.tier_type === 'standard' || !sponsor.tier.tier_type,
  )
  const specialSponsors = sponsors.filter(
    (sponsor) => sponsor.tier.tier_type === 'special',
  )

  // Group standard sponsors by tier
  const standardSponsorsByTier = standardSponsors.reduce(
    (acc, sponsor) => {
      const tierTitle = sponsor.tier.title
      if (!acc[tierTitle]) {
        acc[tierTitle] = []
      }
      acc[tierTitle].push(sponsor)
      return acc
    },
    {} as Record<string, ConferenceSponsor[]>,
  )

  // Group special sponsors by tier
  const specialSponsorsByTier = specialSponsors.reduce(
    (acc, sponsor) => {
      const tierTitle = sponsor.tier.title
      if (!acc[tierTitle]) {
        acc[tierTitle] = []
      }
      acc[tierTitle].push(sponsor)
      return acc
    },
    {} as Record<string, ConferenceSponsor[]>,
  )

  // Get tier names in order: standard first, then special
  const standardTierNames = Object.keys(standardSponsorsByTier)
  const specialTierNames = Object.keys(specialSponsorsByTier)
  const allTierNames = [...standardTierNames, ...specialTierNames]

  return (
    <section id="sponsors" aria-label="Sponsors" className="py-20 sm:py-32">
      <Container>
        <h2 className="font-display mx-auto max-w-4xl text-center text-4xl font-medium tracking-tighter text-blue-900 sm:text-5xl">
          Fueling the cluster: Our sponsors keep the pods running!
        </h2>

        <div className="mx-auto mt-20 space-y-16">
          {allTierNames.map((tierName, tierIndex) => {
            const tierSponsors =
              standardSponsorsByTier[tierName] ||
              specialSponsorsByTier[tierName]
            const isFirstTier = tierIndex === 0
            const isSpecialTier = tierSponsors[0]?.tier.tier_type === 'special'

            // Smaller logo sizes: first tier slightly larger, others equal
            const logoSize = isFirstTier ? 'h-16' : 'h-12'

            // Center align if fewer than 3 sponsors
            const shouldCenter = tierSponsors.length < 3

            return (
              <div key={tierName} className="text-center">
                <h3 className="font-display mb-8 text-2xl font-semibold tracking-tight text-blue-900">
                  {tierName}
                  {isSpecialTier && (
                    <span className="ml-3 inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                      Special Partners
                    </span>
                  )}
                </h3>

                <div
                  className={`mx-auto grid max-w-max grid-cols-1 place-content-center gap-x-16 gap-y-8 ${
                    shouldCenter
                      ? 'sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2'
                      : 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                  }`}
                >
                  {tierSponsors.map((sponsor, i) => (
                    <div
                      key={`${sponsor.sponsor.name}-${i}`}
                      className="flex items-center justify-center"
                    >
                      <a
                        href={sponsor.sponsor.website}
                        className="cursor-pointer hover:opacity-80"
                      >
                        <InlineSvgPreviewComponent
                          className={`${logoSize} cursor-pointer`}
                          value={sponsor.sponsor.logo}
                        />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Become a Sponsor Call-to-Action */}
          <div className="text-center">
            <div className="rounded-2xl bg-blue-50 px-6 py-12 sm:px-12">
              <h3 className="font-display mb-4 text-2xl font-semibold tracking-tight text-blue-900">
                Become a Sponsor
              </h3>
              <p className="mx-auto mb-8 max-w-2xl text-lg text-blue-700">
                Join our community of sponsors and showcase your brand to
                Bergen&apos;s cloud-native community. We have flexible
                sponsorship packages to match your goals and budget.
              </p>
              <Link
                href="/sponsor"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
              >
                View Sponsorship Packages
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
