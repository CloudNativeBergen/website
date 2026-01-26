import { AdminLayout } from '@/components/admin'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAuthSession()
  if (!session || !session.speaker || !session.speaker.is_organizer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500">Access Denied</p>
      </div>
    )
  }

  const { conference } = await getConferenceForCurrentDomain({})
  const conferenceLogos = conference
    ? {
        logo_bright: conference.logo_bright,
        logo_dark: conference.logo_dark,
        logomark_bright: conference.logomark_bright,
        logomark_dark: conference.logomark_dark,
      }
    : undefined

  return <AdminLayout conferenceLogos={conferenceLogos}>{children}</AdminLayout>
}
