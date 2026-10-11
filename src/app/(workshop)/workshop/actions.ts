'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  clearCookie,
  sessionCookie,
  workshopSignOutTarget,
} from '@/lib/workshop/central-sign-in'

/**
 * Sign the attendee out of the workshop portal (#1315, spec §7): the portal's
 * own session cookie on this host is removed, and the browser goes to the auth
 * host, which ends the WorkOS login and sends it back to the front page here.
 * With no session there is no login to end, and it goes to the front page.
 *
 * Nothing is read and WorkOS is not called on this host.
 */
export async function signOutOfWorkshop(): Promise<void> {
  const store = await cookies()
  const cookie = sessionCookie()
  const target = await workshopSignOutTarget(
    await headers(),
    store.get(cookie.name)?.value,
  )
  clearCookie(store, cookie)
  redirect(target)
}
