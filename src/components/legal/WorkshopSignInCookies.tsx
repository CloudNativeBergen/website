/**
 * How /privacy describes the workshop portal's own sign-in cookies (#1311,
 * #1316). What the session holds and how long it lasts come from
 * `src/lib/workshop/central-sign-in/session.ts`, and
 * `__tests__/app/legal-subprocessor-disclosure.test.tsx` pins this wording to
 * that module on the rendered page.
 *
 * `signInHost` is the host `WORKSHOP_AUTH_ORIGIN` names: the other place the
 * short-lived cookies of a sign-in are set. `null` where every host signs
 * attendees in on itself.
 */
interface Props {
  signInHost: string | null
}

function OnSignInHost({ signInHost }: Props) {
  return signInHost ? (
    <> and on the platform&apos;s sign-in host ({signInHost})</>
  ) : null
}

/**
 * The session cookie in the list of workshop participant data. It names
 * WorkOS, so render it only where WorkOS is disclosed for the tenant.
 */
export function WorkshopSessionCookieItem({ signInHost }: Props) {
  return (
    <li>
      • A sign-in cookie on this site, kept for 7 days from the moment you sign
      in, holding your WorkOS User ID, email address, whether WorkOS reports
      that address as verified, your name, the WorkOS session ID, and the site
      and conference it was issued for. Short-lived cookies also exist on this
      site
      <OnSignInHost signInHost={signInHost} /> while you sign in or sign out;
      they expire within ten minutes.
    </li>
  )
}

/**
 * The same cookies in the page's cookies section, for EVERY tenant: a session
 * cookie outlives a switch-off of workshop registration by up to its lifetime,
 * so the description does not follow the tenant's present entitlement. It
 * names no processor.
 */
export function WorkshopSignInCookieNote({ signInHost }: Props) {
  return (
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
      <strong>Workshop sign-in:</strong> If this event offers workshop
      registration and you sign in to its workshop portal, this site sets one
      sign-in cookie of its own, kept for 7 days, holding the ID of your sign-in
      account, your email address, whether it is verified, your name, the ID of
      the sign-in session, and the site and conference it was issued for.
      Signing out removes it. If workshop registration is switched off for the
      event while you are signed in, the cookie stays in your browser until it
      expires or you clear this site&apos;s cookies. While a sign-in or sign-out
      is in progress, short-lived cookies exist on this site
      <OnSignInHost signInHost={signInHost} />; they expire within ten minutes,
      and sooner when the step completes.
    </p>
  )
}
