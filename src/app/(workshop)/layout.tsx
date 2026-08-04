import type { Metadata } from 'next'
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components'
import { Layout } from '@/components/Layout'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function WorkshopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { conference, error } = await getConferenceForCurrentDomain()

  if (error || !conference?._id) {
    notFound()
  }

  // FEATURE GATE (#689): the whole `(workshop)` segment is unavailable — 404,
  // not a degraded page — for any tenant the workshop portal is not enabled
  // for. Fail-closed: an unresolvable organization is treated as disabled.
  if (!(await isWorkshopsEnabledForConference(conference))) {
    notFound()
  }

  return (
    <Layout conference={conference}>
      <AuthKitProvider>{children}</AuthKitProvider>
    </Layout>
  )
}
