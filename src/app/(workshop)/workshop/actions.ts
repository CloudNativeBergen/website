'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { sessionCookie } from '@/lib/workshop/central-sign-in'

/**
 * Sign the attendee out of the workshop portal on this host (#1311): the
 * portal's own session cookie is removed and the browser goes to the front
 * page. Nothing is read and WorkOS is not called.
 *
 * THE WORKOS LOGIN IS NOT ENDED HERE. Ending it goes through the auth host
 * (spec §7), which is the sign-out slice, #1315.
 */
export async function signOutOfWorkshop(): Promise<void> {
  const session = sessionCookie()
  // Set, not delete: a `__Host-` cookie is only replaced by one that is
  // `Secure` with `Path=/`, exactly as it was written.
  ;(await cookies()).set(session.name, '', { ...session.options, maxAge: 0 })
  redirect('/')
}
