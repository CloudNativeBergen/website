import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'
import { domainVerificationId } from '@/lib/domain-verification/challenge'
import { getRedirectUriSyncRow } from '@/lib/domain-verification/sanity'
import { workshopSignInStandingOfRow } from '@/lib/domain-verification/sign-in-standing'
import {
  conferenceBaseUrl,
  hasConferenceDomain,
} from '@/lib/conference/baseUrl'
import { WORKSHOP_PORTAL_PATH, workshopCallbackUri } from './sign-in-paths'

/**
 * WHERE THE WORKSHOP PORTAL MAY SIGN IN (#1296, parent #1293 decisions 3 + 8).
 *
 * Attendees prove an email address through WorkOS AuthKit, in ONE environment
 * shared by every tenant. The redirect URI is therefore chosen PER REQUEST, for
 * the host the attendee is actually on, so the authorization code comes back to
 * that host and the session cookie is sealed there.
 *
 * {@link resolveWorkshopSignInHost} is the one decision every WorkOS entry point
 * takes BEFORE it touches the SDK — the proxy on `/workshop*`, the
 * `/api/auth/callback` route, the tRPC attendee identity, the sign-in and
 * sign-up routes and the sign-out action. A `null` means the caller stops: no
 * authorize URL is built, no code is exchanged, no session is read.
 *
 * THE HOST HEADER IS NEVER TRUSTED ON ITS OWN. The value is first held to the
 * shape of a host (`hostname[:port]`, nothing a URL parser could read as
 * userinfo, a path, a query or a fragment), then its OWN `domainVerification`
 * record is read by id and must stand `ready` (`workshopSignInStanding`): on
 * the verified-redirect allowlist — ownership-proven hosts only, no wildcard,
 * the policy in `@/lib/domain-verification/policy` — AND with its callback
 * registered in WorkOS (#1298). A verified host WorkOS does not have yet would
 * only lead the attendee to a WorkOS error page. The callback is built from the
 * parsed, matched origin and only after the match.
 *
 * READ LIVE, EVERY TIME. The record is not cached here either: a cached
 * answer is a delisting that has not taken effect. That costs one Sanity read
 * per decision, so the decision is taken only on requests that reach WorkOS
 * code (see `src/server/trpc.ts` for the prefilter that keeps unrelated tRPC
 * traffic out). A page or API request decides once; starting a sign-in and
 * signing out decide twice — in the proxy and again in the route or action,
 * which cannot assume the proxy ran. `sign-in-read-budget.test.ts` pins it.
 *
 * FAIL CLOSED: an absent or malformed host, an unverified or unregistered
 * host, a failed read and a configured `WORKOS_COOKIE_DOMAIN` all answer
 * `null`.
 */

export interface WorkshopSignInHost {
  /** `scheme://host[:port]` of the host the attendee is on. */
  origin: string
  /** That host's own AuthKit callback — the `redirect_uri` for this request. */
  redirectUri: string
}

/**
 * The request's host as a URL, or `null` when the value is not a bare
 * `hostname[:port]`. The shape is checked BEFORE parsing: `new URL()` would
 * happily read `attacker@conf.example` as the host `conf.example`.
 */
function parseHost(host: string | null | undefined): URL | null {
  const candidate = host?.trim().toLowerCase()
  if (!candidate || candidate.startsWith('*.')) return null
  if (!isValidDomainEntry(candidate)) return null
  try {
    return new URL(`https://${candidate}`)
  } catch {
    return null
  }
}

function signInHost(origin: string): WorkshopSignInHost {
  return { origin, redirectUri: workshopCallbackUri(origin) }
}

/**
 * May a WorkOS sign-in round-trip run on `host`, and with which callback?
 * See the module doc for the rule; `null` refuses.
 */
export async function resolveWorkshopSignInHost(
  host: string | null | undefined,
): Promise<WorkshopSignInHost | null> {
  // THE SESSION COOKIE STAYS HOST-ONLY. The SDK adds `Domain=` to every cookie
  // it sets when this is configured, which would present one host's session to
  // its sibling hosts — across tenants under a shared suffix. Nothing else can
  // widen the cookie, so with it set nobody signs in.
  if (process.env.WORKOS_COOKIE_DOMAIN) {
    console.error(
      '[workshop] WORKOS_COOKIE_DOMAIN is set; the session cookie must stay host-only, so workshop sign-in is refused on every host. Unset it.',
    )
    return null
  }

  const url = parseHost(host)
  if (!url) return null

  // DEVELOPMENT ONLY: a local server against a WorkOS staging environment.
  // `NODE_ENV` is `production` in every deployed build (previews included), so
  // this branch cannot be reached there; nothing but `localhost` qualifies.
  if (process.env.NODE_ENV === 'development' && url.hostname === 'localhost') {
    return signInHost(`http://${url.host}`)
  }

  const hostname = normalizeDomain(url.host)
  try {
    const row = await getRedirectUriSyncRow(domainVerificationId(hostname))
    // The id is derived from the hostname, but the record must also SAY it.
    const own = row && normalizeDomain(row.record.hostname) === hostname
    const standing = workshopSignInStandingOfRow(own ? row : null, new Date())
    if (standing.state !== 'ready') return null
  } catch (error) {
    console.error(
      '[workshop] sign-in host read failed; refusing sign-in on this host',
      error,
    )
    return null
  }

  // Built from the parsed origin, and only now that it has matched.
  return signInHost(url.origin)
}

/**
 * The host a request arrived on: the `Host` header, which is also what resolves
 * the conference for a page (`getConferenceForCurrentDomain`), so the portal and
 * its sign-in can never be decided for two different hosts.
 */
export function workshopRequestHost(headers: {
  get(name: string): string | null
}): string | null {
  return headers.get('host')
}

/**
 * The portal on the conference's MAIN host (the first of `domains[]`, the one
 * every outbound link uses), or `null` when there is none or it cannot sign in
 * (#1298). For a link sent to an attendee: one that cannot sign in only leads
 * to the unavailable view, so it is left out.
 */
export async function workshopPortalUrl(conference: {
  title?: string | null
  domains?: readonly string[] | null
}): Promise<string | null> {
  if (!hasConferenceDomain(conference)) return null
  const host = new URL(conferenceBaseUrl(conference)).host
  const signIn = await resolveWorkshopSignInHost(host)
  return signIn ? `${signIn.origin}${WORKSHOP_PORTAL_PATH}` : null
}
