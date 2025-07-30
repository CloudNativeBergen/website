import { auth } from '@/lib/auth'
import { getSpeaker } from '@/lib/speaker/sanity'
import { redirect } from 'next/navigation'
import { ProfilePageClient } from '@/components/profile/ProfilePageClient'
import { CFPLayout } from '@/components/cfp/CFPLayout'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/profile')
  }

  const { speaker, err } = await getSpeaker(session.speaker._id)

  if (err) {
    console.error('Error loading speaker:', err)
    return (
      <CFPLayout>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-red-500">Error loading speaker profile</div>
        </div>
      </CFPLayout>
    )
  }

  return (
    <CFPLayout>
      <ProfilePageClient initialSpeaker={speaker} />
    </CFPLayout>
  )
}
