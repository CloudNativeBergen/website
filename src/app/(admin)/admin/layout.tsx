import type { Metadata } from 'next'
import { AdminLayout } from '@/components/admin'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isConferenceUnlisted } from '@/lib/conference/visibility'
import { resolveEnabledFeaturesForConference } from '@/lib/features/enabled'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAuthSession()
  // ORG-SCOPED admin gate (CaaS T1-2, #614): organizer of the CURRENT domain's
  // org (legacy-bridged to the deprecated global flag when the org is unresolvable).
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
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
        // Feeds the generated fallback mark when no logo is uploaded, so an
        // unbranded tenant sees its own initials rather than another
        // conference's logo.
        title: conference.title,
      }
    : undefined

  // Feature-gated admin destinations (#689): the registry hides any nav entry
  // / ⌘K destination tagged with a feature the current org is not entitled to.
  // Resolved from the REAL entitlement resolution for the conference's owning
  // tenant — every registry feature, not a hardcoded `['workshops']` — so
  // tagging a destination is all it takes to gate it. The pages themselves
  // re-check server-side, so this is presentation, not security.
  const enabledFeatures = await resolveEnabledFeaturesForConference(conference)

  return (
    <AdminLayout
      conferenceLogos={conferenceLogos}
      unlisted={isConferenceUnlisted(conference)}
      enabledFeatures={enabledFeatures}
    >
      {children}
    </AdminLayout>
  )
}
