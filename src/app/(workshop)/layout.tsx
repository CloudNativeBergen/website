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

  // NO `AuthKitProvider` (#1296). Nothing here reads its client context, and
  // mounting it does two things this portal must not do: it POSTs an SDK server
  // action on every page load and on every window focus (each a pass through
  // the proxy, so one live allowlist read), and importing it registers the
  // SDK's own server actions as endpoints a browser can call on paths the
  // proxy never sees. The session is read on the server, by the page
  // (`withAuth`) and by tRPC. Guarded by `authkit-client-actions.test.ts`.
  return <Layout conference={conference}>{children}</Layout>
}
