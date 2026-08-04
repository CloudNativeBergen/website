import { getConferenceForDomain } from '@/lib/conference/sanity'
import { isUnknownHost } from '@/lib/conference/guard'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { InfoContent } from '@/components/info/InfoContent'
import { buildInfoFaqs, getScheduleDayInfo } from '@/lib/conference/info-faq'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { canonicalAlternates } from '@/lib/seo/canonical'
import { resolveMetadataBrand } from '@/lib/seo/brand'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await resolveMetadataBrand()
  return {
    title: { absolute: `Practical Information - ${brand}` },
    description: `Essential details for attending ${brand} conference`,
    alternates: await canonicalAlternates('/info'),
  }
}

async function CachedInfoContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:info')

  const { conference, error } = await getConferenceForDomain(domain, {
    schedule: true,
  })

  if (conference?._id) {
    cacheTag(conferenceTag(conference._id))
  }

  if (isUnknownHost({ conference, error })) {
    return null
  }

  const faqs = buildInfoFaqs(
    conference,
    getScheduleDayInfo(conference.schedules),
  )

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-xl lg:max-w-4xl lg:px-12">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
              Practical Information
            </h1>
            <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300">
              <p>
                Here, you&apos;ll find all the essential details you need to
                make the most of your conference experience. From venue
                information to schedules and accessibility, we&apos;ve got you
                covered.
              </p>
              <p>
                If you have any further questions, feel free to reach out to us.
                We&apos;re here to help!
              </p>
            </div>
          </div>
        </Container>
      </div>

      <InfoContent faqs={faqs} />
    </>
  )
}

export default async function InfoPage() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedInfoContent domain={domain} />
}
