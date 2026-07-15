import type { Metadata } from 'next'
import { CFPLayout } from '@/components/cfp/CFPLayout'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function CFPGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    const callbackUrl = encodeURIComponent(fullUrl || '/cfp')
    redirect(`/api/auth/signin?callbackUrl=${callbackUrl}`)
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

  return (
    <>
      {session.isImpersonating && session.realAdmin && (
        <ImpersonationBanner
          impersonatedSpeaker={session.speaker}
          realAdmin={session.realAdmin}
        />
      )}
      <NotificationProvider>
        <CFPLayout conferenceLogos={conferenceLogos}>{children}</CFPLayout>
      </NotificationProvider>
    </>
  )
}
