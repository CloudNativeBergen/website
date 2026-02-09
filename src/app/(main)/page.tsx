import { Hero } from '@/components/Hero'
import { ProgramHighlights } from '@/components/ProgramHighlights'
import { Sponsors } from '@/components/Sponsors'
import { ImageGallery } from '@/components/ImageGallery'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { Container } from '@/components/Container'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

export const metadata = {
  twitter: {
    card: 'summary_large_image',
  },
}

async function CachedHomeContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:homepage')

  const { conference, error } = await getConferenceForDomain(domain, {
    organizers: true,
    sponsors: true,
    sponsorTiers: true,
    featuredSpeakers: true,
    featuredTalks: true,
    schedule: true,
    gallery: { featuredOnly: true },
  })

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  const hasSchedule = conference.schedules && conference.schedules.length > 0
  const sortedOrganizers =
    conference.organizers
      ?.slice()
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ) || []

  return (
    <>
      <Hero conference={conference} />
      {conference.featuredGalleryImages &&
        conference.featuredGalleryImages.length > 0 && (
          <ImageGallery featuredImages={conference.featuredGalleryImages} />
        )}
      {hasSchedule ? (
        <ProgramHighlights
          schedules={conference.schedules!}
          featuredSpeakers={conference.featured_speakers || []}
          featuredTalks={conference.featured_talks || []}
          conference={conference}
        />
      ) : sortedOrganizers.length > 0 ? (
        <section className="py-20 sm:py-32">
          <Container>
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24">
              <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
                Meet Our Organizers
              </h2>
              <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
                The passionate team driving {conference.title}
              </p>
            </div>

            <div className="mt-12 grid auto-rows-fr grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
              {sortedOrganizers.map((organizer) => (
                <SpeakerPromotionCard
                  key={organizer._id}
                  speaker={{
                    ...organizer,
                    talks: [],
                  }}
                  variant="organizer"
                />
              ))}
            </div>
          </Container>
        </section>
      ) : null}
      <Sponsors sponsors={conference.sponsors || []} conference={conference} />
    </>
  )
}

export default async function Home() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedHomeContent domain={domain} />
}
