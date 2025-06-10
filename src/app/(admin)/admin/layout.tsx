import { AdminLayout } from '@/components/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminLayout>{children}</AdminLayout>
}
