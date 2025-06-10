import { AdminLayout } from '@/components/admin'
import { auth } from '@/lib/auth'

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session || !session.speaker || !session.speaker.is_organizer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-gray-500">Access Denied</p>
      </div>
    )
  }

  return <AdminLayout>{children}</AdminLayout>
}
