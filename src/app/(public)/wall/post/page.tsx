import { connection } from 'next/server'
import { ComposerClosed, WallPoster } from '@/components/photo-wall'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { deletionDate } from '@/lib/photo-wall/deletion'
import { requirePhotoWall } from '@/lib/photo-wall/page'
import { isPostingOpen } from '@/lib/photo-wall/window'
import { ensureDevice } from './actions'

/**
 * `/wall/post`, the Composer the QR opens (Photo Wall spec §6.5): the
 * composer while posting is open, the closed page otherwise. 404 without a
 * Photo Wall. Whether posting is open is decided per request; the submit
 * route decides again at Submit.
 */
export default async function ComposerPage() {
  const { conference, wall } = await requirePhotoWall()
  await connection()
  const logo = pickConferenceLogoProps(conference)
  const deletesOn = deletionDate(conference.endDate)
  if (!deletesOn || !isPostingOpen(wall, conference, new Date())) {
    return <ComposerClosed logo={logo} wallClosed={wall.closedAt !== null} />
  }
  return (
    <WallPoster logo={logo} deletesOn={deletesOn} ensureDevice={ensureDevice} />
  )
}
