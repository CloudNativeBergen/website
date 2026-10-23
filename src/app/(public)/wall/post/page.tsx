import { ComposerPlaceholder } from '@/components/photo-wall'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { requirePhotoWall } from '@/lib/photo-wall/page'

/** `/wall/post`, the Composer the QR opens (Photo Wall spec §6.5). M2 and M3b fill it. 404 without a Photo Wall. */
export default async function ComposerPage() {
  const { conference } = await requirePhotoWall()
  return <ComposerPlaceholder logo={pickConferenceLogoProps(conference)} />
}
