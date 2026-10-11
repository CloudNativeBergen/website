import { resolveProvenDestination } from '@/lib/domain-verification/destination'
import {
  conferenceBaseUrl,
  hasConferenceDomain,
} from '@/lib/conference/baseUrl'
import { WORKSHOP_PORTAL_PATH } from './sign-in-paths'

/**
 * WHERE THE WORKSHOP PORTAL IS, for a link that leaves the request: the page's
 * redirect from a secondary host and the link an email carries.
 *
 * A host carries the portal's sign-in when it may receive a hand-off from the
 * auth host (#1311): `resolveProvenDestination`, read live. Registration at
 * WorkOS and who owns the conference no longer take part.
 */

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
 * The conference's MAIN host: the first of `domains[]`, the one every outbound
 * link uses. `null` for a conference with no domain.
 */
export function workshopMainHost(conference: {
  title?: string | null
  domains?: readonly string[] | null
}): string | null {
  if (!hasConferenceDomain(conference)) return null
  return new URL(conferenceBaseUrl(conference)).host
}

/**
 * The portal on the conference's main host ({@link workshopMainHost}), or
 * `null` when there is none or it cannot sign in (#1298). For a link sent to
 * an attendee: one that cannot sign in only leads to the unavailable view, so
 * it is left out.
 */
export async function workshopPortalUrl(conference: {
  title?: string | null
  domains?: readonly string[] | null
}): Promise<string | null> {
  const host = workshopMainHost(conference)
  if (!host) return null
  const destination = await resolveProvenDestination(host)
  return destination ? `${destination.origin}${WORKSHOP_PORTAL_PATH}` : null
}
