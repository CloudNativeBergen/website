import { redirect } from 'next/navigation'

export default async function CFPAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Redirect to new admin dashboard
  redirect('/admin/proposals')
}
