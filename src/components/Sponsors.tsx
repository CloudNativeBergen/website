'use client'

import { Container } from '@/components/Container'
import { SponsorLogo } from '@/components/SponsorLogo'
import { ConferenceSponsor } from '@/lib/sponsor/types'
import Link from 'next/link'

function deterministicShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array]
  let currentIndex = shuffled.length

  let random = seed
  const next = () => {
    random = (random * 1664525 + 1013904223) % 2 ** 32
    return random / 2 ** 32
  }

  while (currentIndex !== 0) {
    const randomIndex = Math.floor(next() * currentIndex)
    currentIndex--
    ;[shuffled[currentIndex], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[currentIndex],
    ]
  }

  return shuffled
}

function getDailySeed(): number {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const day = today.getDate()

  return year * 10000 + month * 100 + day
}

export function Sponsors({ sponsors }: { sponsors: ConferenceSponsor[] }) {
  if (!sponsors || sponsors.length === 0) {
    return null
  }

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
      ...aTierSponsors.map((s) => s.tier.price?.[0]?.amount || 0),
    )
    const bMaxPrice = Math.max(
      ...bTierSponsors.map((s) => s.tier.price?.[0]?.amount || 0),
    )

    if (aMaxPrice !== bMaxPrice) {
      return bMaxPrice - aMaxPrice
    }

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
                        className="-mr-px -mb-px flex min-h-[100px] items-center justify-center border-2 border-dashed border-gray-400 bg-white p-6 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-transparent dark:hover:bg-gray-800/30"
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
