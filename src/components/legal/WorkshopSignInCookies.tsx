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
      they expire within thirty minutes.
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
      <OnSignInHost signInHost={signInHost} />; they expire within thirty
      minutes, and sooner when the step completes.
    </p>
  )
}

/**
 * The sponsor an early sign-up records (#1346), in the list of workshop
 * participant data. It names no processor, so it is shown to every tenant.
 */
export function WorkshopEarlyAccessSponsorItem() {
  return (
    <li>
      • If you sign up through a sponsor&apos;s early-access link before
      registration opens for everyone: which sponsor&apos;s link you used. This
      usually says who you work for.
    </li>
  )
}

/**
 * The early-access cookie (#1346) in the page's cookies section, for EVERY
 * tenant, as the sign-in cookie is: it stays in the browser until it expires,
 * whatever the tenant's entitlement is by then. What it holds and when it
 * expires come from `src/lib/workshop/early-access/open.ts`.
 */
export function WorkshopEarlyAccessCookieNote() {
  return (
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
      <strong>Workshop early access:</strong> If you open a sponsor&apos;s
      early-access link to this event&apos;s workshop portal, this site sets one
      cookie that holds the code of that link and nothing else. It is set only
      by opening such a link, and it is how the portal knows you may sign up for
      workshops before registration opens for everyone. It expires when
      registration opens for everyone, as that time stood when you opened the
      link. Signing out does not remove it; clearing this site&apos;s cookies
      does.
    </p>
  )
}
