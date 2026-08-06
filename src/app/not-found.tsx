import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { Layout } from '@/components/Layout'
import { PlatformLanding } from '@/components/PlatformLanding'
import { PlatformUnavailable } from '@/components/PlatformUnavailable'
import { headers } from 'next/headers'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'

export default async function NotFound() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''
  const resolution = await getConferenceForDomain(domain, {})

  // ORDER MATTERS, and this file needs its OWN branch (#848). It sits OUTSIDE
  // the (main) group, so the layout's unavailable-check never runs for it:
  // during a Sanity outage every typo'd or unmatched URL on a live tenant's
  // domain served the claim pitch. The 404 status keeps crawlers from banking
  // it, but a human visitor read it.
  if (isConferenceUnavailable(resolution)) {
    return <PlatformUnavailable />
  }

  // Unknown host: don't render the tenant chrome (Header/Footer) around empty
  // conference data — show the same platform landing every other page uses.
  if (isUnknownHost(resolution)) {
    return <PlatformLanding signupUrl={process.env.PLATFORM_SIGNUP_URL} />
  }

  return (
    <Layout conference={resolution.conference} showFooter={false}>
      <div className="relative flex h-full items-center py-20 sm:py-36">
        <BackgroundImage className="-top-36 bottom-0" />
        <Container className="relative flex w-full flex-col items-center">
          <p className="font-display text-2xl tracking-tight text-blue-900 dark:text-blue-100">
            404
          </p>
          <h1 className="font-display mt-4 text-4xl font-medium tracking-tighter text-blue-600 sm:text-5xl dark:text-blue-300">
            Page not found
          </h1>
          <p className="mt-4 text-lg tracking-tight text-blue-900 dark:text-blue-100">
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
          </p>
          <Button href="/" variant="primary" className="mt-8">
            Go back home
          </Button>
        </Container>
      </div>
    </Layout>
  )
}
