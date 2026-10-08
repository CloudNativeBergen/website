import { isValidDomainEntry } from '@/lib/conference/domains'
import { isVerifiedRedirectOrigin } from '@/lib/domain-verification/allowlist'
import { WORKSHOP_AUTH_CALLBACK_PATH } from './sign-in-paths'

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
 * userinfo, a path, a query or a fragment), then matched EXACTLY against the
 * verified-redirect allowlist (`isVerifiedRedirectOrigin` — ownership-proven
 * hosts only, no wildcard, see `@/lib/domain-verification/allowlist`). The
 * callback is built from the parsed, matched origin and only after the match.
 *
 * READ LIVE, EVERY TIME. The allowlist is not cached here either: a cached
 * answer is a delisting that has not taken effect. That costs one Sanity read
 * per decision, so the callers are arranged to decide once per request and only
 * on requests that reach WorkOS code (see `src/server/trpc.ts` for the prefilter
 * that keeps unrelated tRPC traffic out).
 *
 * FAIL CLOSED: an absent or malformed host, an unverified host, a failed
 * allowlist read and a configured `WORKOS_COOKIE_DOMAIN` all answer `null`.
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
  return { origin, redirectUri: `${origin}${WORKSHOP_AUTH_CALLBACK_PATH}` }
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

  try {
    if (!(await isVerifiedRedirectOrigin(url.origin))) return null
  } catch (error) {
    console.error(
      '[workshop] redirect allowlist read failed; refusing sign-in on this host',
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
