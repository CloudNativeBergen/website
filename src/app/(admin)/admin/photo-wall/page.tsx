import { ErrorDisplay } from '@/components/admin'
import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { PhotoWallAdminPage } from '@/components/photo-wall/admin'

/**
 * The Photo Wall for organizers (Photo Wall spec §10). The page reads
 * nothing of the wall itself but the schedule's rooms: the data comes from `photoWall.settings`, an
 * `adminProcedure`.
 */
export default async function AdminPhotoWallPage() {
  const denied = await denyNonOrganizer()
  if (denied) return denied
  const { conference, error } = await getConferenceForCurrentDomain({
    schedule: true,
  })
  if (error || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={error?.message || 'Could not load conference data'}
      />
    )
  }
  // Each room once, for its QR sign (Talk photos spec §6.4).
  const rooms = [
    ...new Set(
      (conference.schedules ?? []).flatMap((day) =>
        day.tracks.map((t) => t.trackTitle),
      ),
    ),
  ]
  return <PhotoWallAdminPage conferenceTitle={conference.title} rooms={rooms} />
}
