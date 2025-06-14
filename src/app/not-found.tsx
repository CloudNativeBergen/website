import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { Layout } from '@/components/Layout'
import { headers } from 'next/headers'
import { getConferenceForDomain } from '@/lib/conference/sanity'

export default async function NotFound() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { conference, error } = await getConferenceForDomain(domain)

  return (
    <Layout conference={conference} showFooter={false}>
      <div className="relative flex h-full items-center py-20 sm:py-36">
        <BackgroundImage className="-top-36 bottom-0" />
        <Container className="relative flex w-full flex-col items-center">
          <p className="font-display text-2xl tracking-tight text-blue-900">
            404
          </p>
          <h1 className="font-display mt-4 text-4xl font-medium tracking-tighter text-blue-600 sm:text-5xl">
            Page not found
          </h1>
          <p className="mt-4 text-lg tracking-tight text-blue-900">
            Sorry, we couldn’t find the page you’re looking for.
          </p>
          <Button href="/" variant="primary" className="mt-8">
            Go back home
          </Button>
        </Container>
      </div>
    </Layout>
  )
}
