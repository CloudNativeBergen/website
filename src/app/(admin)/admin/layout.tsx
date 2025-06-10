import { AdminLayout } from '@/components/AdminLayout'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { conference, error } = await getConferenceForCurrentDomain()

  return <AdminLayout>{children}</AdminLayout>
}
