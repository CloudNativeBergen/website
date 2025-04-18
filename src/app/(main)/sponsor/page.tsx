import { CheckIcon } from '@heroicons/react/20/solid'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

function PriceFormat({ price }: { price: { amount: number; currency: string }[] }) {
  return (
    <span className="text-3xl font-bold tracking-tight text-gray-900">
      {price[0].amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} {price[0].currency}
    </span>
  )
}

export default async function Sponsor() {
  const { conference, error } = await getConferenceForCurrentDomain({ sponsorTiers: true });
  if (error) {
    console.error("Failed to load conference data:", error);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Unable to load sponsor information</h2>
        <p className="text-gray-700 mb-6">We're experiencing technical difficulties. Please try again later.</p>
        <Button href="/" className="bg-blue-600 text-white hover:bg-blue-500">
          Return to Home
        </Button>
      </div>
    );
  }

  const sponsorTiers = conference?.sponsor_tiers || [];
  sponsorTiers.sort((a, b) => {
    const amountA = a.price[0].amount;
    const amountB = b.price[0].amount;
    return amountA - amountB;
  });

  return (
    <>
      <div className="relative py-20 sm:pb-24 sm:pt-36">
        <BackgroundImage className="-bottom-14 -top-36" />
        <Container className="relative">
          <div className="mx-auto max-w-xl lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl">
              Become a Sponsor
            </h1>
            <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900">
              <p>
                Showcase your brand to {conference.city}'s cloud-native community by sponsoring {conference.title}. We've designed flexible sponsorship packages to match your specific marketing goals and budget constraints.
              </p>
              <p>
                Your sponsorship is vital—it enables us to deliver a world-class conference while keeping tickets affordable for attendees. Partner with us and gain valuable exposure while supporting the local tech ecosystem.
              </p>
            </div>
          </div>
        </Container>

        <Container>
          <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {sponsorTiers.map((tier, index) => (
              <div
                key={index}
                className={classNames(
                  tier.most_popular
                    ? 'lg:z-10 lg:rounded-b-none'
                    : 'lg:mt-8',
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
                      className={classNames(
                        tier.most_popular
                          ? 'text-blue-600'
                          : 'text-gray-900',
                        'text-xl font-semibold leading-8',
                      )}
                    >
                      {tier.title}
                    </h3>
                    {tier.most_popular ? (
                      <p className="rounded-full bg-blue-600/10 px-2.5 py-1 text-sm font-semibold leading-5 text-blue-600">
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
                    <span className="text-sm font-semibold leading-6 text-gray-600"></span>
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
                    href={"mailto:foo@bar.com"}
                    aria-describedby={`tier-${index}`}
                    className={classNames(
                      tier.most_popular
                        ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-500'
                        : 'text-blue-600 ring-1 ring-inset ring-blue-200 hover:ring-blue-300',
                      'mt-8 block rounded-md px-3 py-2 text-center text-sm font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
                    )}
                  >
                    Become a &apos;{tier.title}&apos; sponsor
                  </Button>
                ) : (
                  <p className="mt-8 text-center text-sm font-semibold leading-6 text-gray-600">
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
