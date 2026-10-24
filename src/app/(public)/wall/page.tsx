import { notFound } from 'next/navigation'
import { WallBoard } from '@/components/photo-wall'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { getWall } from '@/lib/photo-wall/cache'
import { requirePhotoWall } from '@/lib/photo-wall/page'
import { wallPageView } from '@/lib/photo-wall/wall-read'

/**
 * `/wall`, the public Wall page (Photo Wall spec §9.1): rendered with the
 * cached wall, then polled through `wall.get` (§8). 404 without a Photo Wall.
 */
export default async function WallPage() {
  const { conference } = await requirePhotoWall()
  const data = await getWall(conference._id)
  if (!data) notFound()
  // `requirePhotoWall()` read the request's host: `now` is request time.
  return (
    <WallBoard
      initial={wallPageView(data, conference, new Date())}
      logo={pickConferenceLogoProps(conference)}
      title={conference.title}
      contactEmail={conference.contactEmail}
    />
  )
}
