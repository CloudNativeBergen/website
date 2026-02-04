import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { SponsorTier, ConferenceSponsor } from '@/lib/sponsor/types'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'
import { SponsorProspectus } from '@/components/sponsor/SponsorProspectus'

export const metadata = {
  title: 'Become a Sponsor - Cloud Native Days Norway',
  description:
    'Sponsorship opportunities for Cloud Native Days Norway conference',
  twitter: {
    card: 'summary_large_image',
  },
}

async function CachedSponsorContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:sponsor')

  const { conference, error } = await getConferenceForDomain(domain, {
    sponsorTiers: true,
    sponsors: true,
    gallery: { featuredLimit: 8, featuredOnly: true },
  })

  if (error || !conference) {
    console.error('Failed to load conference data:', error)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <h2 className="mb-4 text-2xl font-bold text-red-600 dark:text-red-400">
          Unable to load sponsor information
        </h2>
        <p className="mb-6 text-gray-700 dark:text-gray-300">
          We&apos;re experiencing technical difficulties. Please try again
          later.
        </p>
        <Button href="/" variant="primary">
          Return to Home
        </Button>
      </div>
    )
  }

  const allSponsorTiers = conference.sponsor_tiers || []
  const sponsorBenefits = conference.sponsor_benefits || []

  // Show a message if no sponsor tiers are configured
  if (allSponsorTiers.length === 0 && sponsorBenefits.length === 0) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-xl text-center lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
              Become a Sponsor
            </h1>
            <p className="font-display mt-6 text-2xl tracking-tight text-blue-900 dark:text-blue-300">
              Sponsorship opportunities for {conference.title} will be announced
              soon. Please check back later or contact us at{' '}
              <a
                href={`mailto:${conference.sponsor_email}?subject=Sponsorship Inquiry`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {conference.sponsor_email}
              </a>{' '}
              for more information.
            </p>
            <div className="mt-8">
              <Button href="/" variant="primary">
                Return to Home
              </Button>
            </div>
          </div>
        </Container>
      </div>
    )
  }

  const standardSponsorTiers = allSponsorTiers
    .filter((tier) => tier.tier_type === 'standard')
    .sort((a, b) => {
      const getMaxPrice = (tier: SponsorTier) => {
        if (!tier.price || tier.price.length === 0) return 0
        return Math.max(...tier.price.map((p) => p.amount))
      }
      return getMaxPrice(b) - getMaxPrice(a)
    })

  const specialSponsorTiers = allSponsorTiers
    .filter((tier) => tier.tier_type === 'special')
    .sort((a, b) => {
      const getMaxPrice = (tier: SponsorTier) => {
        if (!tier.price || tier.price.length === 0) return 0
        return Math.max(...tier.price.map((p) => p.amount))
      }
      return getMaxPrice(b) - getMaxPrice(a)
    })

  const addonSponsorTiers = allSponsorTiers
    .filter(
      (tier) =>
        (tier.tier_type as 'standard' | 'special' | 'addon') === 'addon',
    )
    .sort((a, b) => {
      const getMaxPrice = (tier: SponsorTier) => {
        if (!tier.price || tier.price.length === 0) return 0
        return Math.max(...tier.price.map((p) => p.amount))
      }
      return getMaxPrice(b) - getMaxPrice(a)
    })

  return (
    <SponsorProspectus
      conference={conference}
      standardTiers={standardSponsorTiers}
      specialTiers={specialSponsorTiers}
      addonTiers={addonSponsorTiers}
      pastSponsors={(conference.sponsors as ConferenceSponsor[]) || []}
    />
  )
}

export default async function SponsorPage() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedSponsorContent domain={domain} />
}
