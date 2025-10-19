import { getAuthSession } from '@/lib/auth'
import { getSpeaker } from '@/lib/speaker/sanity'
import { redirect } from 'next/navigation'
import { CFPProfilePage } from '@/components/cfp/CFPProfilePage'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function ProfilePage() {
  const session = await getAuthSession()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/profile')
  }

  const { speaker, err } = await getSpeaker(session.speaker._id)

  if (err) {
    console.error('Error loading speaker:', err)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-500 dark:text-red-400">
          Error loading speaker profile
        </div>
      </div>
    )
  }

  const { conference } = await getConferenceForCurrentDomain()

  return (
    <CFPProfilePage initialSpeaker={speaker} conferenceId={conference?._id} />
  )
}
