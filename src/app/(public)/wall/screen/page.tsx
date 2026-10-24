import { notFound } from 'next/navigation'
import { ScreenMode } from '@/components/photo-wall'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { photoWallLinks } from '@/lib/photo-wall/links'
import { requirePhotoWall } from '@/lib/photo-wall/page'
import { readScreenPage } from '@/lib/photo-wall/screen-page'
import { getPublicSponsorsForConference } from '@/lib/sponsor-crm/sanity'

/**
 * `/wall/screen`, Screen Mode for the venue display (Photo Wall spec §9.2):
 * rendered with the cached wall, then polled through
 * `photoWallPublic.screen` every 5 s (§8). The sponsors are read here, once
 * (§9.4); the Sponsor strip switch arrives with every poll. 404 without a
 * Photo Wall.
 */
export default async function ScreenPage() {
  const { conference } = await requirePhotoWall()
  const [initial, sponsors] = await Promise.all([
    readScreenPage(conference._id),
    // A sponsor read that fails must not take the venue screen down with it.
    getPublicSponsorsForConference(conference._id).catch((error: unknown) => {
      console.error('Could not read the sponsors for Screen Mode', error)
      return []
    }),
  ])
  if (!initial) notFound()
  return (
    <ScreenMode
      initial={initial}
      conference={{
        logo: pickConferenceLogoProps(conference),
        postUrl: photoWallLinks(conference).post,
        sponsors,
      }}
    />
  )
}
