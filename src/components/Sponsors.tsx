'use client'
// Use client due to the use of InlineSvgPreviewComponent that renders SVGs

import { Container } from '@/components/Container'
import { ConferenceSponsor } from '@/lib/sponsor/types'
import { InlineSvgPreviewComponent } from '@starefossen/sanity-plugin-inline-svg-input'
import Link from 'next/link'

export function Sponsors({ sponsors }: { sponsors: ConferenceSponsor[] }) {
  // Early return if no sponsors
  if (!sponsors || sponsors.length === 0) {
    return null
  }

  // Group sponsors by tier, but treat all special tiers as one "SPECIAL" group
  const groupedSponsors = sponsors.reduce(
    (acc, sponsor) => {
      const tierTitle =
        sponsor.tier.tier_type === 'special' ? 'SPECIAL' : sponsor.tier.title
      if (!acc[tierTitle]) {
        acc[tierTitle] = []
      }
      acc[tierTitle].push(sponsor)
      return acc
    },
    {} as Record<string, ConferenceSponsor[]>,
  )

  // Sort sponsors within each tier by value (most expensive first) for standard tiers
  Object.keys(groupedSponsors).forEach((tierName) => {
    if (tierName !== 'SPECIAL') {
      groupedSponsors[tierName].sort((a, b) => {
        const aPrice = a.tier.price?.[0]?.amount || 0
        const bPrice = b.tier.price?.[0]?.amount || 0
        return bPrice - aPrice // Sort descending (most expensive first)
      })
    }
  })

  // Sort tier names by hierarchy and value
  const sortedTierNames = Object.keys(groupedSponsors).sort((a, b) => {
    // Special group always goes last
    if (a === 'SPECIAL' && b !== 'SPECIAL') return 1
    if (b === 'SPECIAL' && a !== 'SPECIAL') return -1
    if (a === 'SPECIAL' && b === 'SPECIAL') return 0

    // For standard tiers, sort by highest price in tier (most expensive tier first)
    const aTierSponsors = groupedSponsors[a]
    const bTierSponsors = groupedSponsors[b]

    const aMaxPrice = Math.max(
      ...aTierSponsors.map((s) => s.tier.price?.[0]?.amount || 0),
    )
    const bMaxPrice = Math.max(
      ...bTierSponsors.map((s) => s.tier.price?.[0]?.amount || 0),
    )

    if (aMaxPrice !== bMaxPrice) {
      return bMaxPrice - aMaxPrice // Sort descending (most expensive tier first)
    }

    // If prices are equal, sort alphabetically
    return a.localeCompare(b)
  })

  return (
    <section id="sponsors" aria-label="Sponsors" className="py-20 sm:py-32">
      <Container>
        <div className="mb-20">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl">
              Our sponsors
            </h2>
            <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
              Meet our sponsors who are fueling the cluster and keeping the pods
              running!
            </p>
          </div>
        </div>

        {/* Unified responsive sponsor grid */}
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
          {sortedTierNames.map((tierName) => {
            const tierSponsors = groupedSponsors[tierName]

            return (
              <div
                key={tierName}
                className="mb-12 last:mb-0 lg:relative lg:mb-0"
              >
                {/* Tier header - responsive positioning */}
                <div className="mb-6 flex items-center gap-3 lg:absolute lg:top-8 lg:left-0 lg:mb-0 lg:w-32">
                  <div className="h-0.5 w-4 bg-brand-cloud-blue dark:bg-brand-cloud-blue"></div>
                  <h3 className="font-display text-lg font-bold tracking-wider whitespace-nowrap text-brand-cloud-blue uppercase dark:text-brand-cloud-blue">
                    {tierName}
                  </h3>
                </div>

                {/* Tier sponsors grid - responsive columns */}
                <div className="lg:ml-40">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                    {tierSponsors.map((sponsor, i) => (
                      <div
                        key={`${sponsor.sponsor.name}-${i}`}
                        className="-mr-px -mb-px flex min-h-[100px] items-center justify-center border-2 border-dashed border-gray-400 bg-white p-6 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-100 dark:hover:bg-gray-200"
                      >
                        <a
                          href={sponsor.sponsor.website}
                          className="block rounded transition-opacity hover:opacity-75 focus:opacity-75 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Visit ${sponsor.sponsor.name} website`}
                        >
                          <InlineSvgPreviewComponent
                            className="h-8 w-auto max-w-full object-contain sm:h-10 lg:h-8"
                            value={sponsor.sponsor.logo}
                          />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Become a Sponsor Call-to-Action */}
        <div className="mt-20 text-center">
          <div className="rounded-2xl bg-brand-sky-mist px-8 py-12 sm:px-12 dark:bg-gray-800/60">
            <h3 className="font-display mb-4 text-2xl font-bold tracking-tight text-brand-cloud-blue dark:text-blue-400">
              Become a Sponsor
            </h3>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-brand-slate-gray dark:text-gray-300">
              Join our community of sponsors and showcase your brand to
              Bergen&apos;s cloud-native community. We have flexible sponsorship
              packages to match your goals and budget.
            </p>
            <Link
              href="/sponsor"
              className="inline-flex items-center justify-center rounded-lg bg-brand-cloud-blue px-8 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none dark:bg-brand-cloud-blue dark:hover:bg-brand-cloud-blue-hover dark:focus:ring-offset-gray-800"
            >
              View Sponsorship Packages
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}
