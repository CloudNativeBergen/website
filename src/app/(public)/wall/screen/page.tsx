import { ScreenPlaceholder } from '@/components/photo-wall'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { requirePhotoWall } from '@/lib/photo-wall/page'

/** `/wall/screen`, Screen Mode for the venue display (Photo Wall spec §9.2). M5b fills it. 404 without a Photo Wall. */
export default async function ScreenPage() {
  const { conference } = await requirePhotoWall()
  return <ScreenPlaceholder logo={pickConferenceLogoProps(conference)} />
}
