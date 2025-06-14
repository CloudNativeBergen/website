import { CheckIcon } from '@heroicons/react/20/solid'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import clsx from 'clsx'

function PriceFormat({
  price,
}: {
  price: { amount: number; currency: string }[]
}) {
  return (
    <span className="text-3xl font-bold tracking-tight text-gray-900">
      {price[0].amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}{' '}
      {price[0].currency}
    </span>
  )
}

export default async function Sponsor() {
  const { conference, error } = await getConferenceForCurrentDomain({
    sponsorTiers: true,
  })
  if (error) {
    console.error('Failed to load conference data:', error)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <h2 className="mb-4 text-2xl font-bold text-red-600">
          Unable to load sponsor information
        </h2>
        <p className="mb-6 text-gray-700">
          We&apos;re experiencing technical difficulties. Please try again
          later.
        </p>
        <Button href="/" variant="primary">
          Return to Home
        </Button>
      </div>
    )
  }

  const sponsorTiers = conference?.sponsor_tiers || []
  sponsorTiers.sort((a, b) => {
    const amountA = a.price[0].amount
    const amountB = b.price[0].amount
    return amountA - amountB
  })

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-xl lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl">
              Become a Sponsor
            </h1>
            <div className="font-display mt-6 space-y-6 text-2xl tracking-tight text-blue-900">
              <p>
                Showcase your brand to {conference.city}&apos;s cloud-native
                community by sponsoring {conference.title}. We&apos;ve designed
                flexible sponsorship packages to match your specific marketing
                goals and budget constraints.
              </p>
              <p>
                Your sponsorship is vital—it enables us to deliver a world-class
                conference while keeping tickets affordable for attendees.
                Partner with us and gain valuable exposure while supporting the
                local tech ecosystem.
              </p>
            </div>
          </div>
        </Container>

        <Container>
          <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {sponsorTiers.map((tier, index) => (
              <div
                key={index}
                className={clsx(
                  tier.most_popular ? 'lg:z-10 lg:rounded-b-none' : 'lg:mt-8',
                  tier.sold_out ? 'lg:opacity-50' : '',
                  index === 0 ? 'lg:rounded-r-none' : '',
                  index === sponsorTiers.length - 1 ? 'lg:rounded-l-none' : '',
                  'flex flex-col justify-between rounded-3xl bg-white p-8 ring-1 ring-gray-200 xl:p-10',
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-x-4">
                    <h3
                      id={`tier-${index}`}
                      className={clsx(
                        tier.most_popular ? 'text-blue-600' : 'text-gray-900',
                        'text-xl leading-8 font-semibold',
                      )}
                    >
                      {tier.title}
                    </h3>
                    {tier.most_popular ? (
                      <p className="rounded-full bg-blue-600/10 px-2.5 py-1 text-sm leading-5 font-semibold text-blue-600">
                        Most popular
                      </p>
                    ) : null}
                  </div>
                  <p className="text-md mt-4 leading-6 text-gray-600">
                    {tier.tagline}
                  </p>
                  <p className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-3xl font-bold tracking-tight text-gray-900">
                      <PriceFormat price={tier.price} />
                    </span>
                    <span className="text-sm leading-6 font-semibold text-gray-600"></span>
                  </p>
                  <ul
                    role="list"
                    className="text-md mt-8 space-y-3 leading-6 text-gray-600"
                  >
                    {tier.perks.map((perk, perkIndex) => (
                      <li key={`perk-${perkIndex}`} className="flex gap-x-3">
                        <CheckIcon
                          className="h-6 w-5 flex-none text-blue-600"
                          aria-hidden="true"
                        />
                        {perk.description}
                      </li>
                    ))}
                  </ul>
                </div>
                {!tier.sold_out ? (
                  <Button
                    href={`mailto:${conference.contact_email}?subject=Interested in sponsoring ${conference.title}&body=We are interested in the ${tier.title} sponsorship tier.`}
                    aria-describedby={`tier-${index}`}
                    variant={tier.most_popular ? 'success' : 'outline'}
                    className="mt-8 w-full"
                  >
                    Become a &apos;{tier.title}&apos; sponsor
                  </Button>
                ) : (
                  <p className="mt-8 text-center text-sm leading-6 font-semibold text-gray-600">
                    Sold out
                  </p>
                )}
              </div>
            ))}
          </div>
        </Container>
      </div>
    </>
  )
}
