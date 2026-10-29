import type { Metadata } from 'next'
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

  // NO SESSION PROVIDER (#1296, #1311). The portal's session is its own sealed
  // cookie, read on the server by the page and by tRPC; nothing here needs a
  // client context, and no WorkOS SDK is imported by the application at all.
  // Guarded by `no-authkit-sdk.test.ts`.
  return <Layout conference={conference}>{children}</Layout>
}
