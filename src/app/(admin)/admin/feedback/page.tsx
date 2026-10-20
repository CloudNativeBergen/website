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
  const { conference } = await getConferenceForCurrentDomain()
  return <SessionFeedbackAdminPage conferenceTitle={conference?.title} />
}
