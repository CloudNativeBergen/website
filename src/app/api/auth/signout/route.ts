import { signOut } from '@workos-inc/authkit-nextjs'
import { redirect } from 'next/navigation'

export async function GET() {
  // Sign out using WorkOS AuthKit
  await signOut()

  // Redirect to home page after sign out
  redirect('/')
}