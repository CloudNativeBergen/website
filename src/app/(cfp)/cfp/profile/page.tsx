import { getAuthSession } from '@/lib/auth'
import { getSpeaker } from '@/lib/speaker/sanity'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { CFPProfilePage } from '@/components/cfp/CFPProfilePage'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function ProfilePage() {
  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/profile')
  }

  const { speaker, err } = await getSpeaker(session.speaker._id)

  if (err) {
    console.error('Error loading speaker:', err)
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800/50 dark:bg-red-900/20">
          <div className="text-red-500 dark:text-red-400">
            Error loading speaker profile
          </div>
        </div>
      </div>
    )
  }

  const { conference } = await getConferenceForCurrentDomain()

  return (
    <CFPProfilePage initialSpeaker={speaker} conferenceId={conference?._id} />
  )
}
