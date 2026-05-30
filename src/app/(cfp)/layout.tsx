import { CFPLayout } from '@/components/cfp/CFPLayout'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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
    return null
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
      <CFPLayout conferenceLogos={conferenceLogos}>{children}</CFPLayout>
    </>
  )
}
