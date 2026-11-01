import type { Metadata } from 'next'
import { CFPLayout } from '@/components/cfp/CFPLayout'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { resolveEnabledFeaturesForConference } from '@/lib/features/enabled'

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
  // Only organizers see the admin links these gate; a failed read hides the
  // feature-gated ones rather than failing the portal.
  const enabledFeatures = session.speaker.isOrganizer
    ? await resolveEnabledFeaturesForConference(conference).catch(() => [])
    : []
  const conferenceLogos = conference
    ? {
        logoBright: conference.logoBright,
        logoDark: conference.logoDark,
        logomarkBright: conference.logomarkBright,
        logomarkDark: conference.logomarkDark,
        // Feeds the generated fallback mark when no logo is uploaded. Note this
        // is BRANDING, not theming: the portal still renders in the platform
        // palette (no `TenantThemeStyle` here) — it just stops showing another
        // conference's wordmark.
        title: conference.title,
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
        <CFPLayout
          conferenceLogos={conferenceLogos}
          enabledFeatures={enabledFeatures}
        >
          {children}
        </CFPLayout>
      </NotificationProvider>
    </>
  )
}
