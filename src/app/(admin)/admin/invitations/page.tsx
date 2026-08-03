import { ErrorDisplay } from '@/components/admin'
import { InvitationLettersPageClient } from '@/components/admin/invitation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function AdminInvitationLetters() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain()

  if (conferenceError || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={conferenceError?.message || 'Could not load conference data'}
      />
    )
  }

  return <InvitationLettersPageClient conference={conference} />
}
