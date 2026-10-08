'use server'

import { signOut } from '@workos-inc/authkit-nextjs'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import {
  resolveWorkshopSignInHost,
  workshopRequestHost,
} from '@/lib/workshop/sign-in'

/**
 * Sign the attendee out of the workshop portal (#1296).
 *
 * The SDK's `signOut` removes the session cookie on this host and sends the
 * browser to WorkOS's logout endpoint for THIS session, which is what actually
 * ends it. The link this replaces went to NextAuth's `/api/auth/signout` — a
 * different auth system — and left the WorkOS session untouched.
 *
 * `returnTo` is the home page of the host the attendee is on, built from the
 * origin that matched the allowlist. WorkOS only honours a `return_to` that is
 * registered as a Sign-out redirect for the environment; what it does with one
 * that is not is undocumented (see the PR for #1296).
 *
 * THE HOST DECISION COMES FIRST HERE TOO. A server action is not bound to the
 * page that rendered it: its id can be POSTed to any path, including ones the
 * proxy never sees. So this takes the decision itself, and a host that may not
 * sign in gets the same 404 as everywhere else — the SDK is not entered.
 */
export async function signOutOfWorkshop(): Promise<void> {
  const signIn = await resolveWorkshopSignInHost(
    workshopRequestHost(await headers()),
  )
  if (!signIn) notFound()

  await signOut({ returnTo: `${signIn.origin}/` })
}
