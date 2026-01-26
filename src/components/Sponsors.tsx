'use client'

import { Container } from '@/components/Container'
import { SponsorLogo } from '@/components/SponsorLogo'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { ConferenceSponsor } from '@/lib/sponsor/types'
import { Conference } from '@/lib/conference/types'
import {
  groupSponsorsByTier,
  getDailySeed,
  deterministicShuffle,
  getTierMaxPrice,
} from '@/lib/sponsor/utils'
import Link from 'next/link'

export function Sponsors({
  sponsors,
  conference,
}: {
  sponsors: ConferenceSponsor[]
  conference: Conference
}) {
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

  const sortedTierNames = Object.keys(groupedSponsors).sort((a, b) => {
    if (a === 'SPECIAL' && b !== 'SPECIAL') return 1
    if (b === 'SPECIAL' && a !== 'SPECIAL') return -1
    if (a === 'SPECIAL' && b === 'SPECIAL') return 0

    const aTierSponsors = groupedSponsors[a]
    const bTierSponsors = groupedSponsors[b]

    const aMaxPrice = Math.max(
      ...aTierSponsors.map((s) => getTierMaxPrice(s.tier)),
    )
    const bMaxPrice = Math.max(
      ...bTierSponsors.map((s) => getTierMaxPrice(s.tier)),
    )

    if (aMaxPrice !== bMaxPrice) {
      return bMaxPrice - aMaxPrice
    }

    return a.localeCompare(b)
  })

  return (
    <section id="sponsors" aria-label="Sponsors" className="py-20 sm:py-32">
      <Container>
        {hasSponsors && (
          <div className="mb-20">
            <div className="mx-auto max-w-2xl lg:mx-0">
              <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl">
                Our sponsors
              </h2>
              <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
                Meet our sponsors who are fueling the cluster and keeping the
                pods running!
              </p>
            </div>
          </div>
        )}

        {hasSponsors && (
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            {sortedTierNames.map((tierName) => {
              const tierSponsors = groupedSponsors[tierName]

              return (
                <div
                  key={tierName}
                  className="mb-12 last:mb-0 lg:relative lg:mb-0"
                >
                  <div className="mb-6 flex items-center gap-3 lg:absolute lg:top-8 lg:left-0 lg:mb-0 lg:w-32">
                    <div className="h-0.5 w-4 bg-brand-cloud-blue dark:bg-brand-cloud-blue"></div>
                    <h3 className="font-display text-lg font-bold tracking-wider whitespace-nowrap text-brand-cloud-blue uppercase dark:text-brand-cloud-blue">
                      {tierName}
                    </h3>
                  </div>

                  <div className="lg:ml-40">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                      {tierSponsors.map((sponsor, i) => (
                        <div
                          key={`${sponsor.sponsor.name}-${i}`}
                          className="-mr-px -mb-px flex min-h-25 items-center justify-center border-2 border-dashed border-gray-400 bg-white p-6 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-transparent dark:hover:bg-gray-800/30"
                        >
                          <a
                            href={sponsor.sponsor.website}
                            className="block rounded transition-opacity hover:opacity-75 focus:opacity-75 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Visit ${sponsor.sponsor.name} website`}
                          >
                            <SponsorLogo
                              logo={sponsor.sponsor.logo}
                              logoBright={sponsor.sponsor.logo_bright}
                              name={sponsor.sponsor.name}
                              className="h-8 w-auto max-w-full object-contain sm:h-10 lg:h-8"
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
        )}

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
                  Become a Sponsor
                </h3>
                <p className="font-inter mx-auto mb-8 max-w-2xl text-lg text-brand-slate-gray sm:mx-0">
                  Level up your brand&apos;s visibility among Kubernetes
                  enthusiasts, container wranglers, and cloud architects. We
                  have sponsorship tiers for every cluster size.
                </p>
                {conference.sponsor_tiers &&
                conference.sponsor_tiers.length > 0 ? (
                  <Link
                    href="/sponsor"
                    className="inline-flex items-center justify-center rounded-lg bg-brand-cloud-blue px-8 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none dark:bg-brand-cloud-blue dark:hover:bg-brand-cloud-blue-hover dark:focus:ring-offset-gray-800"
                  >
                    View Sponsorship Packages
                  </Link>
                ) : (
                  <a
                    href={`mailto:${conference.sponsor_email}?subject=Sponsorship Inquiry`}
                    className="inline-flex items-center justify-center rounded-lg bg-brand-cloud-blue px-8 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue-hover focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none dark:bg-brand-cloud-blue dark:hover:bg-brand-cloud-blue-hover dark:focus:ring-offset-gray-800"
                  >
                    Contact Us About Sponsoring
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
