import { ErrorDisplay } from '@/components/admin'
import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { SessionFeedbackAdminPage } from '@/components/feedback/admin'

/**
 * Session Feedback for organizers (speaker feedback spec §10.1). The page
 * reads nothing of the conference's feedback itself: the data comes from
 * `sessionFeedback.adminOverview`, an `adminProcedure`.
 */
export default async function AdminFeedbackPage() {
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
  return <SessionFeedbackAdminPage conferenceTitle={conference.title} />
}
