import { AdminLayout } from '@/components/admin'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAuthSession()
  if (!session || !session.speaker || !session.speaker.isOrganizer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500">Access Denied</p>
      </div>
    )
  }

  const { conference } = await getConferenceForCurrentDomain({})
  const conferenceLogos = conference
    ? {
        logoBright: conference.logoBright,
        logoDark: conference.logoDark,
        logomarkBright: conference.logomarkBright,
        logomarkDark: conference.logomarkDark,
      }
    : undefined

  return <AdminLayout conferenceLogos={conferenceLogos}>{children}</AdminLayout>
}
