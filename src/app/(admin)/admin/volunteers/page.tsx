import { ErrorDisplay } from '@/components/admin'
import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { VolunteerAdminPage } from '@/components/volunteer'

/**
 * Volunteer admin. The page reads no volunteer data itself: the list comes
 * from `volunteer.admin.list`, an admin procedure.
 */
export default async function AdminVolunteersPage() {
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
  return <VolunteerAdminPage />
}
