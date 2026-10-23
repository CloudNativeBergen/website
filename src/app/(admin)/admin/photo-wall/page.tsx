import { ErrorDisplay } from '@/components/admin'
import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { PhotoWallAdminPage } from '@/components/photo-wall/admin'

/**
 * The Photo Wall for organizers (Photo Wall spec §10). The page reads
 * nothing of the wall itself: the data comes from `photoWall.settings`, an
 * `adminProcedure`.
 */
export default async function AdminPhotoWallPage() {
  const denied = await denyNonOrganizer()
  if (denied) return denied
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={error?.message || 'Could not load conference data'}
      />
    )
  }
  return <PhotoWallAdminPage conferenceTitle={conference.title} />
}
