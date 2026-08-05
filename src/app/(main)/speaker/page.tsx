import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { SpeakersNotAnnouncedNotice } from '@/components/speaker/SpeakersNotAnnouncedNotice'
import { getSpeakers } from '@/lib/speaker/sanity'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { isUnknownHost } from '@/lib/conference/guard'
import { hasSubmittableFormats, isCfpOpen } from '@/lib/conference/state'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd'
import { canonicalAlternates, canonicalUrl } from '@/lib/seo/canonical'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Speakers',
    description: 'Meet the speakers sharing their expertise.',
    alternates: await canonicalAlternates('/speaker'),
    twitter: {
      card: 'summary_large_image',
    },
  }
}

async function CachedSpeakersContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:speakers')

  const { conference, error } = await getConferenceForDomain(domain)

  if (conference?._id) {
    cacheTag(conferenceTag(conference._id))
  }

  // Unknown host: the (main) layout renders the platform landing in place of
  // this subtree, so bail before dereferencing an empty conference.
  if (isUnknownHost({ conference, error })) {
    return null
  }

  const { speakers, err } = await getSpeakers(conference._id)
  if (err) {
    console.error(err)
  }

  const speakersWithTalks: SpeakerWithTalks[] = speakers.map((speaker) => ({
    ...speaker,
    talks: speaker.proposals || [],
  }))

  // "Meet our 0 speakers" over an empty grid is what every conference shows
  // before its first acceptance — including every freshly provisioned tenant,
  // and including anyone who follows "View Speakers" from the /tickets
  // coming-soon card.
  const hasSpeakers = speakersWithTalks.length > 0
  const canSubmit = isCfpOpen(conference) && hasSubmittableFormats(conference)

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: canonicalUrl(conference, domain, '/') },
          {
            name: 'Speakers',
            url: canonicalUrl(conference, domain, '/speaker'),
          },
        ]}
      />
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl lg:mx-0">
              <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
                {hasSpeakers
                  ? `Meet our ${speakersWithTalks.length} ${
                      speakersWithTalks.length === 1 ? 'speaker' : 'speakers'
                    }`
                  : 'Speakers'}
              </h1>
              {hasSpeakers && (
                <p className="font-inter mt-6 text-xl leading-8 tracking-tight text-brand-slate-gray dark:text-gray-300">
                  These industry experts will share their insights and
                  experiences. Get ready to be inspired and learn from the best
                  in the field.
                </p>
              )}
            </div>

            {hasSpeakers ? (
              <div className="mx-auto mt-20 grid max-w-2xl auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
                {speakersWithTalks.map((speaker) => (
                  <SpeakerPromotionCard
                    key={speaker._id}
                    speaker={speaker}
                    variant="compact"
                    ctaText="View Profile"
                  />
                ))}
              </div>
            ) : (
              <div className="mx-auto max-w-2xl lg:mx-0">
                <SpeakersNotAnnouncedNotice
                  contactEmail={conference.contactEmail}
                  cfpOpen={canSubmit}
                />
              </div>
            )}
          </div>
        </Container>
      </div>
    </>
  )
}

export default async function Speakers() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedSpeakersContent domain={domain} />
}
