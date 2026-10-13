'use server'

import { refresh } from 'next/cache'
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
 * Nothing is read and WorkOS is not called on this host. The portal page is
 * REPLACED in the browser's history, so "back" after signing out does not
 * return to it.
 */
export async function signOutOfWorkshop(): Promise<void> {
  const store = await cookies()
  const cookie = sessionCookie()
  const sealed = store.get(cookie.name)?.value
  clearCookie(store, cookie)
  redirect(await workshopSignOutTarget(await headers(), sealed), 'replace')
}

/**
 * Render the portal page again, with what the server knows now (#1346). The
 * list calls it when a sign-up is refused for a person the page showed early
 * access to: their link was revoked while the page was open, and the banner
 * and the buttons on screen are no longer true. It reads and writes nothing.
 */
export async function refreshWorkshopPortal(): Promise<void> {
  refresh()
}
