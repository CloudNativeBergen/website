import { CheckIcon } from '@heroicons/react/20/solid'
import * as HeroIcons from '@heroicons/react/24/outline'
import type { ElementType } from 'react'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { Sponsors } from '@/components/Sponsors'
import { Conference } from '@/lib/conference/types'
import { SponsorTier, ConferenceSponsor } from '@/lib/sponsor/types'
import clsx from 'clsx'
import Image from 'next/image'

// Helper to dynamically render HeroIcons
function DynamicIcon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const IconComponent = (HeroIcons as Record<string, ElementType>)[name]
  if (!IconComponent) return null
  return <IconComponent className={className} aria-hidden="true" />
}

function PriceFormat({
  price,
}: {
  price: { amount: number; currency: string }[]
}) {
  return (
    <span className="text-xl font-bold tracking-tight text-white">
      {price[0].amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}{' '}
      {price[0].currency}
    </span>
  )
}

function QuantityBadge({ max_quantity }: { max_quantity?: number }) {
  if (!max_quantity) return null

  if (max_quantity === 1) {
    return (
      <span className="inline-flex items-center rounded-md bg-purple-400/10 px-2 py-1 text-xs font-medium text-purple-400 ring-1 ring-inset ring-purple-400/30">
        Exclusive
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-md bg-yellow-400/10 px-2 py-1 text-xs font-medium text-yellow-400 ring-1 ring-inset ring-yellow-400/30">
      Limited to {max_quantity}
    </span>
  )
}

interface SponsorProspectusProps {
  conference: Conference
  standardTiers: SponsorTier[]
  specialTiers: SponsorTier[]
  addonTiers: SponsorTier[]
  pastSponsors: ConferenceSponsor[]
}

export function SponsorProspectus({
  conference,
  standardTiers,
  specialTiers,
  addonTiers,
  pastSponsors,
}: SponsorProspectusProps) {
  const sponsorBenefits = conference.sponsor_benefits || []
  const galleryImages = conference.featuredGalleryImages || []
  const customization = conference.sponsorship_customization

  const heroHeadline =
    customization?.hero_headline || 'No Sales Pitches. Just Code & Culture.'
  const heroSubheadline =
    customization?.hero_subheadline ||
    'We prioritize engineering value over marketing fluff. Our audience builds the platforms Norway runs on. Join us in powering the voyage.'
  const packageTitle = customization?.package_section_title || 'The Base Image'
  const addonTitle =
    customization?.addon_section_title || 'Custom Resource Definitions (CRDs)'
  const philosophyTitle =
    customization?.philosophy_title ||
    "We Don't Sell Booths. We Build Credibility."
  const philosophyDescription =
    customization?.philosophy_description ||
    "We intentionally do not have a traditional Expo Hall. Why? Because the best engineers don't like being sold to in a booth. Instead, we integrate your brand into the fabric of the event through digital hype, on-site signage, and our curated 'Wall of Opportunities'."
  const closingQuote =
    customization?.closing_quote ||
    "The best engineers don't apply to job ads; they work for companies they respect."
  const closingCta =
    customization?.closing_cta_text || 'git commit -m "Support the Community"'

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
              {heroHeadline}
            </h1>
            <p className="font-mono mt-8 text-lg leading-8 text-gray-600 dark:text-gray-300">
              {heroSubheadline}
            </p>
          </div>
        </Container>

        {/* Scaling Stats (v3.0 Production Grade) */}
        {conference.vanity_metrics && conference.vanity_metrics.length > 0 && (
          <Container className="mt-16">
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-2 dark:border-gray-800 dark:bg-white/5">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                {conference.vanity_metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="flex flex-col items-center justify-center rounded-lg bg-white py-8 px-4 shadow-sm dark:bg-gray-900"
                  >
                    <dt className="font-mono text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
                      {metric.label}
                    </dt>
                    <dd className="mt-2 font-display text-4xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </div>
            </div>
          </Container>
        )}

        {/* Why Sponsor Section - Benefits */}
        {sponsorBenefits.length > 0 && (
          <Container className="mt-24">
            <div className="mx-auto max-w-2xl lg:max-w-none">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {sponsorBenefits.map((benefit, index) => (
                  <div
                    key={index}
                    className="flex flex-col rounded-2xl bg-white/50 p-8 shadow-sm ring-1 ring-gray-200 backdrop-blur-sm sm:p-10 dark:bg-white/5 dark:ring-gray-700"
                  >
                    {benefit.icon && (
                      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white dark:bg-blue-500">
                        <DynamicIcon name={benefit.icon} className="h-6 w-6" />
                      </div>
                    )}
                    <h3 className="text-xl font-semibold leading-7 text-gray-900 dark:text-white">
                      {benefit.title}
                    </h3>
                    <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">
                      {benefit.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Container>
        )}

        {/* Base Image Packages */}
        <Container className="mt-32">
          <div className="mb-12 flex items-center gap-4">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            <h2 className="font-mono text-xl font-bold tracking-tight text-gray-900 uppercase dark:text-white">
              &gt; {packageTitle}
            </h2>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          </div>

          <div className="isolate mx-auto grid max-w-md grid-cols-1 gap-8 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {standardTiers.map((tier) => (
              <div
                key={tier._id}
                className={clsx(
                  'flex flex-col justify-between rounded-3xl bg-gray-900 p-8 ring-1 ring-gray-800 xl:p-10',
                  tier.most_popular ? 'ring-2 ring-blue-500' : '',
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-x-4">
                    <h3 className="font-mono text-lg font-semibold leading-8 text-white">
                      {tier.title}
                    </h3>
                    <div className="flex gap-2">
                      {tier.most_popular ? (
                        <span className="inline-flex items-center rounded-md bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/30">
                          Recommended
                        </span>
                      ) : null}
                      <QuantityBadge max_quantity={tier.max_quantity} />
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-gray-300">
                    {tier.tagline}
                  </p>
                  {tier.price && tier.price.length > 0 && (
                    <p className="mt-6 flex items-baseline gap-x-1">
                      <PriceFormat price={tier.price} />
                    </p>
                  )}
                  {tier.perks && tier.perks.length > 0 && (
                    <ul
                      role="list"
                      className="mt-8 space-y-3 text-sm leading-6 text-gray-300"
                    >
                      {tier.perks.map((perk, perkIndex) => (
                        <li key={`perk-${perkIndex}`} className="flex gap-x-3">
                          <CheckIcon
                            className="h-6 w-5 flex-none text-blue-400"
                            aria-hidden="true"
                          />
                          {perk.description}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {!tier.sold_out ? (
                  <a
                    href={`mailto:${conference.sponsor_email}?subject=Interested in ${tier.title} package`}
                    className={clsx(
                      tier.most_popular
                        ? 'bg-blue-500 text-white hover:bg-blue-400 focus-visible:outline-blue-500'
                        : 'bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white',
                      'font-mono mt-8 block rounded-md px-3 py-2 text-center text-sm font-semibold shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2',
                    )}
                  >
                    Deploy {tier.title}
                  </a>
                ) : (
                  <p className="font-mono mt-8 text-center text-sm leading-6 font-semibold text-gray-500">
                    // Sold out
                  </p>
                )}
              </div>
            ))}
          </div>
        </Container>

        {/* Add-ons (CRDs) */}
        {addonTiers.length > 0 && (
          <Container className="mt-32">
            <div className="mb-12 flex items-center gap-4">
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              <h2 className="font-mono text-xl font-bold tracking-tight text-gray-900 uppercase dark:text-white">
                &gt; {addonTitle}
              </h2>
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>

            <div className="mx-auto grid max-w-lg grid-cols-1 gap-6 lg:max-w-4xl lg:grid-cols-3">
              {addonTiers.map((tier) => (
                <div
                  key={tier._id}
                  className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:border-blue-500/50 hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-mono text-lg font-semibold leading-8 text-gray-900 dark:text-white">
                        {tier.title}
                      </h3>
                      <div className="flex gap-2">
                        <QuantityBadge max_quantity={tier.max_quantity} />
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                      {tier.tagline}
                    </p>

                    {tier.price && tier.price.length > 0 && (
                      <p className="mt-4 flex items-baseline gap-x-1">
                        <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                          {tier.price[0].amount
                            .toString()
                            .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}{' '}
                          {tier.price[0].currency}
                        </span>
                      </p>
                    )}

                    {tier.perks && tier.perks.length > 0 && (
                      <ul
                        role="list"
                        className="mt-6 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-400"
                      >
                        {tier.perks.map((perk, perkIndex) => (
                          <li
                            key={`addon-perk-${perkIndex}`}
                            className="flex gap-x-3"
                          >
                            <span className="font-mono text-blue-500">
                              &gt;
                            </span>
                            {perk.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {!tier.sold_out ? (
                    <a
                      href={`mailto:${conference.sponsor_email}?subject=Interested in ${tier.title} add-on`}
                      className="font-mono mt-8 block rounded-md border border-gray-200 bg-white px-3 py-2 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                    >
                      git add {tier.title}
                    </a>
                  ) : (
                    <span className="font-mono mt-8 inline-flex items-center justify-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-400/10 dark:text-red-400">
                      Sold Out
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Container>
        )}

        {/* Philosophy Section - Why No Booths */}
        <Container className="mt-32">
          <div className="rounded-3xl bg-gray-900 px-6 py-16 shadow-2xl sm:px-12 sm:py-20 lg:flex lg:items-center lg:justify-between lg:px-20">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {philosophyTitle}
              </h2>
              <p className="mt-6 text-lg leading-8 text-gray-300">
                {philosophyDescription}
              </p>
            </div>
            <div className="mt-10 flex shrink-0 transform items-center justify-center lg:mt-0 lg:ml-8 lg:rotate-6">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-white/10 backdrop-blur-xl">
                <HeroIcons.NoSymbolIcon className="h-16 w-16 text-white" />
              </div>
            </div>
          </div>
        </Container>

        {/* Special Tiers */}
        {specialTiers.length > 0 && (
          <Container className="mt-32">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-white">
                Special Partnerships
              </h2>
              <p className="mt-4 text-lg leading-8 text-gray-600 dark:text-gray-300">
                Community and media partners
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-lg grid-cols-1 gap-8 lg:max-w-4xl lg:grid-cols-2">
              {specialTiers.map((tier) => (
                <div
                  key={tier._id}
                  className="flex flex-col rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <h3 className="text-xl font-semibold leading-8 text-gray-900 dark:text-white">
                    {tier.title}
                  </h3>
                  <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">
                    {tier.tagline}
                  </p>
                  <div className="mt-6">
                    <Button
                      href={`mailto:${conference.sponsor_email}?subject=Interested in ${tier.title} partnership`}
                      variant="outline"
                      className="w-full"
                    >
                      Contact Us
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        )}

        {/* Past/Current Sponsors */}
        {pastSponsors && pastSponsors.length > 0 && (
          <div className="mt-32">
            <Sponsors
              sponsors={pastSponsors}
              conference={conference}
              showCTA={false}
            />
          </div>
        )}

        {/* Vibe Check (Gallery) */}
        {galleryImages.length > 0 && (
          <div className="mt-32">
            <Container>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-white">
                  The Vibe
                </h2>
                <p className="mt-4 text-lg leading-8 text-gray-600 dark:text-gray-300">
                  See what it&apos;s like to be part of our community
                </p>
              </div>
              <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4">
                {galleryImages.slice(0, 8).map((image, i) => (
                  <div
                    key={image._id}
                    className="relative aspect-square overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800"
                  >
                    <Image
                      src={image.imageUrl || ''}
                      alt={image.imageAlt || `Conference vibe ${i + 1}`}
                      fill
                      className="object-cover transition duration-300 hover:scale-105"
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                    />
                  </div>
                ))}
              </div>
            </Container>
          </div>
        )}

        {/* Closing Commit */}
        <Container className="mt-32 mb-24 text-center">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-white">
              &quot;{closingQuote}&quot;
            </h2>
            <div className="mt-10 flex justify-center">
              <div className="group relative inline-flex">
                <div className="transition-all duration-1000 group-hover:-inset-1 group-hover:duration-200 animate-tilt absolute -inset-0.5 rounded-lg bg-linear-to-r from-pink-600 to-purple-600 opacity-75 blur-sm filter"></div>
                <a
                  href={`mailto:${conference.sponsor_email}`}
                  className="font-mono relative inline-flex items-center justify-center rounded-lg bg-black px-8 py-4 text-lg font-bold text-white transition-all duration-200 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:outline-none"
                >
                  <span className="mr-2">&gt;</span> {closingCta}
                  <span className="ml-2 animate-pulse">_</span>
                </a>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </>
  )
}