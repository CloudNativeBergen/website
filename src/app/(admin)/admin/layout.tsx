import { AdminLayout } from '@/components/admin'
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
