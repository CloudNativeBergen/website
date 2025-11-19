import { AdminLayout } from '@/components/admin'
import { getAuthSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAuthSession()
  if (!session || !session.speaker || !session.speaker.is_organizer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500">Access Denied</p>
      </div>
    )
  }

  return <AdminLayout>{children}</AdminLayout>
}
