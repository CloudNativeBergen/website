import { redirect } from 'next/navigation'

export default async function CFPAdminLayout() {
  // Redirect to new admin dashboard
  redirect('/admin/proposals')
}
