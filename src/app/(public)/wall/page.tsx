import { WallPagePlaceholder } from '@/components/photo-wall'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { requirePhotoWall } from '@/lib/photo-wall/page'

/** `/wall`, the public Wall page (Photo Wall spec §9.1). M5a fills it. 404 without a Photo Wall. */
export default async function WallPage() {
  const { conference } = await requirePhotoWall()
  return <WallPagePlaceholder logo={pickConferenceLogoProps(conference)} />
}
