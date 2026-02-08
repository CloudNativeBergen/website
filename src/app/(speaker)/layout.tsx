import { CFPLayout } from '@/components/cfp/CFPLayout'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function CFPGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    redirect('/api/auth/signin?callbackUrl=/speaker/list')
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

  return (
    <>
      {session.isImpersonating && session.realAdmin && (
        <ImpersonationBanner
          impersonatedSpeaker={session.speaker}
          realAdmin={session.realAdmin}
        />
      )}
      <CFPLayout conferenceLogos={conferenceLogos}>{children}</CFPLayout>
    </>
  )
}
