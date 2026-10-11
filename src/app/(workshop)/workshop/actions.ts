'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { clearCookie, sessionCookie } from '@/lib/workshop/central-sign-in'

/**
 * Sign the attendee out of the workshop portal on this host (#1311): the
 * portal's own session cookie is removed and the browser goes to the front
 * page. Nothing is read and WorkOS is not called.
 *
 * THE WORKOS LOGIN IS NOT ENDED HERE. Ending it goes through the auth host
 * (spec §7), which is the sign-out slice, #1315.
 */
export async function signOutOfWorkshop(): Promise<void> {
  clearCookie(await cookies(), sessionCookie())
  redirect('/')
}
