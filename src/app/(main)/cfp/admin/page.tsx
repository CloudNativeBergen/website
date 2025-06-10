import { redirect } from 'next/navigation'

/**
 * Legacy redirect from /cfp/admin to the new admin dashboard
 * This ensures old bookmarks and links continue to work
 */
export default function CFPAdminRedirect() {
  redirect('/admin/proposals')
}
