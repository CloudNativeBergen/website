import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { getTermsForConference } from '@/lib/sponsor-crm/contract-templates'
import { PortableText } from '@portabletext/react'
import { portableTextComponents } from '@/lib/portabletext/components'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

export const metadata = {
  title: 'Sponsorship Terms & Conditions - Cloud Native Days Norway',
  description:
    'General terms and conditions for sponsorship of Cloud Native Days Norway',
}

async function CachedTermsContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('days')
  cacheTag('content:sponsor-terms')

  const { conference, error: confError } = await getConferenceForDomain(domain)

  if (confError || !conference) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <h2 className="mb-4 text-2xl font-bold text-red-600 dark:text-red-400">
          Unable to load terms
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

  const {
    terms,
    conferenceName,
    error: termsError,
  } = await getTermsForConference(conference._id)

  if (termsError || !terms) {
    return (
      <div className="py-20 sm:pt-36 sm:pb-24">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-jetbrains text-3xl font-bold tracking-tighter text-brand-cloud-blue sm:text-4xl dark:text-blue-400">
              Sponsorship Terms &amp; Conditions
            </h1>
            <p className="font-inter mt-6 text-lg text-brand-slate-gray dark:text-gray-300">
              Terms and conditions for {conference.title} sponsorship are not
              yet available. Please contact us at{' '}
              <a
                href={`mailto:${conference.sponsorEmail}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {conference.sponsorEmail}
              </a>{' '}
              for more information.
            </p>
            <div className="mt-8">
              <Button href="/sponsor" variant="primary">
                View Sponsorship Options
              </Button>
            </div>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="py-20 sm:pt-36 sm:pb-24">
      <Container>
        <div className="mx-auto max-w-3xl">
          <h1 className="font-jetbrains mb-2 text-center text-3xl font-bold tracking-tighter text-brand-cloud-blue sm:text-4xl dark:text-blue-400">
            General Terms &amp; Conditions
          </h1>
          <p className="font-inter mb-12 text-center text-lg text-brand-slate-gray dark:text-gray-400">
            {conferenceName || conference.title} Sponsorship Agreement
          </p>

          <div className="prose prose-lg dark:prose-invert max-w-none">
            <PortableText value={terms} components={portableTextComponents} />
          </div>

          <div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              For questions about these terms, please contact{' '}
              <a
                href={`mailto:${conference.sponsorEmail}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {conference.sponsorEmail}
              </a>
            </p>
          </div>
        </div>
      </Container>
    </div>
  )
}

export default async function SponsorTermsPage() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedTermsContent domain={domain} />
}
