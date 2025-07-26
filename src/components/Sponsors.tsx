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

  // Sort tier names by hierarchy
  const sortedTierNames = Object.keys(groupedSponsors).sort((a, b) => {
    // Special group always goes last
    if (a === 'SPECIAL' && b !== 'SPECIAL') return 1
    if (b === 'SPECIAL' && a !== 'SPECIAL') return -1
    if (a === 'SPECIAL' && b === 'SPECIAL') return 0

    // For standard tiers, sort alphabetically
    return a.localeCompare(b)
  })

  // Calculate tier positions (each tier starts a new row)
  const tierPositions: { tier: string; rowStart: number }[] = []
  let currentRow = 0

  sortedTierNames.forEach((tierName) => {
    tierPositions.push({ tier: tierName, rowStart: currentRow })
    const tierSponsors = groupedSponsors[tierName]
    const rowsNeeded = Math.ceil(tierSponsors.length / 6) // 6 columns max
    currentRow += rowsNeeded
  })

  // Create flat array of sponsors with proper row breaks
  const sponsorGrid: (ConferenceSponsor | null)[] = []
  const tierRowMapping: { [tier: string]: number } = {} // Track actual row positions
  let gridPosition = 0

  sortedTierNames.forEach((tierName) => {
    const tierSponsors = groupedSponsors[tierName]

    // Start tier at beginning of new row
    const currentRowPosition = gridPosition % 6
    if (currentRowPosition !== 0) {
      // Fill rest of current row with nulls
      for (let i = currentRowPosition; i < 6; i++) {
        sponsorGrid.push(null)
        gridPosition++
      }
    }

    // Record the actual row where this tier starts
    tierRowMapping[tierName] = Math.floor(gridPosition / 6)

    // Add tier sponsors
    tierSponsors.forEach((sponsor) => {
      sponsorGrid.push(sponsor)
      gridPosition++
    })
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

        {/* Desktop: Grid layout with absolute positioned labels */}
        <div className="relative hidden lg:block">
          {/* Tier labels positioned absolutely */}
          <div className="absolute top-0 left-0 w-32">
            {sortedTierNames.map((tier) => {
              const actualRow = tierRowMapping[tier]
              const topOffset = actualRow * 100 + 35 // Adjusted up from 50 to 35

              return (
                <div
                  key={tier}
                  className="absolute flex items-center gap-3"
                  style={{ top: `${topOffset}px` }}
                >
                  <div className="h-0.5 w-4 bg-blue-900"></div>
                  <h3 className="font-display text-lg font-bold tracking-wider whitespace-nowrap text-blue-900 uppercase">
                    {tier}
                  </h3>
                </div>
              )
            })}
          </div>

          {/* Single unified sponsor grid */}
          <div className="ml-40">
            <div className="grid grid-cols-5 xl:grid-cols-6">
              {sponsorGrid.map((sponsor, i) => (
                <div
                  key={sponsor ? `${sponsor.sponsor.name}-${i}` : `empty-${i}`}
                  className={`flex min-h-[100px] items-center justify-center p-6 transition-colors ${
                    sponsor
                      ? '-mr-px -mb-px border-2 border-dashed border-gray-400 hover:bg-gray-50'
                      : ''
                  }`}
                >
                  {sponsor && (
                    <a
                      href={sponsor.sponsor.website}
                      className="block rounded transition-opacity hover:opacity-75 focus:opacity-75 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Visit ${sponsor.sponsor.name} website`}
                    >
                      <InlineSvgPreviewComponent
                        className="h-8 w-auto max-w-full object-contain"
                        value={sponsor.sponsor.logo}
                      />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile & Tablet: Stacked tier sections */}
        <div className="space-y-12 lg:hidden">
          {sortedTierNames.map((tierName) => {
            const tierSponsors = groupedSponsors[tierName]

            return (
              <div key={tierName} className="space-y-6">
                {/* Tier header */}
                <div className="flex items-center gap-3">
                  <div className="h-0.5 w-4 bg-blue-900"></div>
                  <h3 className="font-display text-lg font-bold tracking-wider text-blue-900 uppercase">
                    {tierName}
                  </h3>
                </div>

                {/* Tier sponsors grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3">
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
                          className="h-10 w-auto max-w-full object-contain"
                          value={sponsor.sponsor.logo}
                        />
                      </a>
                    </div>
                  ))}
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
