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
    
    const aMaxPrice = Math.max(...aTierSponsors.map(s => s.tier.price?.[0]?.amount || 0))
    const bMaxPrice = Math.max(...bTierSponsors.map(s => s.tier.price?.[0]?.amount || 0))
    
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
            <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray">
              Meet our sponsors who are fueling the cluster and keeping the pods
              running!
            </p>
          </div>
        </div>

        {/* Unified responsive sponsor grid using container queries */}
        <div className="@container">
          {sortedTierNames.map((tierName) => {
            const tierSponsors = groupedSponsors[tierName]

            return (
              <div key={tierName} className="mb-12 last:mb-0 @4xl:mb-0">
                {/* Tier header - responsive positioning */}
                <div className="mb-6 flex items-center gap-3 @4xl:absolute @4xl:left-0 @4xl:mt-8 @4xl:mb-0 @4xl:w-32">
                  <div className="h-0.5 w-4 bg-blue-900"></div>
                  <h3 className="font-display text-lg font-bold tracking-wider whitespace-nowrap text-blue-900 uppercase">
                    {tierName}
                  </h3>
                </div>

                {/* Tier sponsors grid - responsive columns */}
                <div className="@4xl:ml-40">
                  <div className="grid grid-cols-2 @sm:grid-cols-3 @4xl:grid-cols-5">
                    {tierSponsors.map((sponsor, i) => (
                      <div
                        key={`${sponsor.sponsor.name}-${i}`}
                        className="-mr-px -mb-px flex min-h-[100px] items-center justify-center border-2 border-dashed border-gray-400 p-6 transition-colors hover:bg-gray-50"
                      >
                        <a
                          href={sponsor.sponsor.website}
                          className="block rounded transition-opacity hover:opacity-75 focus:opacity-75 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Visit ${sponsor.sponsor.name} website`}
                        >
                          <InlineSvgPreviewComponent
                            className="h-8 w-auto max-w-full object-contain @[480px]:h-10 @4xl:h-8"
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
          <div className="rounded-2xl bg-blue-50 px-8 py-12 sm:px-12">
            <h3 className="font-display mb-4 text-2xl font-bold tracking-tight text-blue-900">
              Become a Sponsor
            </h3>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-blue-700">
              Join our community of sponsors and showcase your brand to
              Bergen&apos;s cloud-native community. We have flexible sponsorship
              packages to match your goals and budget.
            </p>
            <Link
              href="/sponsor"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
            >
              View Sponsorship Packages
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}
