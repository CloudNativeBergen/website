import type { Metadata } from 'next'
import { AdminLayout } from '@/components/admin'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isConferenceUnlisted } from '@/lib/conference/visibility'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

import { Suspense } from 'react'

async function AdminContent({ children }: { children: React.ReactNode }) {
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
      }
    : undefined

  return (
    <AdminLayout
      conferenceLogos={conferenceLogos}
      unlisted={isConferenceUnlisted(conference)}
    >
      {children}
    </AdminLayout>
  )
}

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-gray-500">Loading admin...</div>}>
      <AdminContent>{children}</AdminContent>
    </Suspense>
  )
}
