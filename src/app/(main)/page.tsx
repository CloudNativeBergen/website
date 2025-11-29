import { Hero } from '@/components/Hero'
import { ProgramHighlights } from '@/components/ProgramHighlights'
import { Sponsors } from '@/components/Sponsors'
import { ImageGallery } from '@/components/ImageGallery'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

async function CachedHomeContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:homepage')

  const { conference, error } = await getConferenceForDomain(domain, {
    organizers: true,
    sponsors: true,
    featuredSpeakers: true,
    featuredTalks: true,
    schedule: true,
    gallery: { featuredOnly: true },
  })

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  return (
    <>
      <Hero conference={conference} />
      {conference.featuredGalleryImages &&
        conference.featuredGalleryImages.length > 0 && (
          <ImageGallery featuredImages={conference.featuredGalleryImages} />
        )}
      {conference.schedules && conference.schedules.length > 0 && (
        <ProgramHighlights
          schedules={conference.schedules}
          featuredSpeakers={conference.featured_speakers || []}
          featuredTalks={conference.featured_talks || []}
          conference={conference}
        />
      )}
      <Sponsors sponsors={conference.sponsors || []} />
    </>
  )
}

export default async function Home() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedHomeContent domain={domain} />
}
