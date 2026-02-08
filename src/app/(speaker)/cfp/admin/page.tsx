import { redirect } from 'next/navigation'

export default function CFPAdminRedirect() {
  redirect('/admin/proposals')
}
