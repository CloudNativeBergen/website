import { notFound } from 'next/navigation'
import { WallBoard } from '@/components/photo-wall'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { requirePhotoWall } from '@/lib/photo-wall/page'
import { readWallPage } from '@/lib/photo-wall/wall-page'

/**
 * `/wall`, the public Wall page (Photo Wall spec §9.1): rendered with the
 * cached wall, then polled through `photoWallPublic.get` (§8). 404 without a
 * Photo Wall.
 */
export default async function WallPage() {
  const { conference } = await requirePhotoWall()
  // `requirePhotoWall()` read the request's host: `now` is request time.
  const initial = await readWallPage(conference, new Date())
  if (!initial) notFound()
  return (
    <WallBoard
      initial={initial}
      conference={{
        logo: pickConferenceLogoProps(conference),
        title: conference.title,
        contactEmail: conference.contactEmail,
      }}
    />
  )
}
