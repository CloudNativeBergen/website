import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { normalizeDomain } from '@/lib/conference/domains'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import {
  isAuthHost,
  resolveTenantHost,
  toPortal,
} from '../central-sign-in/decision'
import { workshopMainHost, workshopPortalUrl } from '../sign-in'
import { WORKSHOP_EARLY_ACCESS_INVALID_QUERY } from '../sign-in-paths'
import { earlyAccessCookie } from './cookie'
import { earlyAccessUrl } from './link'
import { resolveEarlyAccess } from './links'

/** The token is in the address: no answer is cached or sends a referrer. */
const SEALED = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
} as const

const notFound = () =>
  new NextResponse('Not Found', { status: 404, headers: SEALED })

/**
 * OPEN A SPONSOR'S EARLY-ACCESS LINK (#1346, spec §5). In this order:
 *
 *  1. AS THE PORTAL ANSWERS, before anything is read about the token: a 404
 *     on the auth host, for a host with no conference and for a conference
 *     without workshops.
 *  2. A HOST THAT CANNOT SIGN IN sets nothing. While the conference's main
 *     host can, the browser goes to the same address there: the cookie has to
 *     be set by the host the person will sign up on. Otherwise to the portal
 *     page, which says sign-up is not available. Never from the main host to
 *     itself.
 *  3. A LINK THAT IS NOT LIVE goes to the portal page with one notice, and an
 *     existing cookie is left as it is. A token that never existed, a revoked
 *     one and another conference's are answered identically.
 *  4. A LIVE LINK goes to the portal page with the cookie, which expires at
 *     the official opening. With no official opening ahead there is nothing
 *     for it to do and no expiry to take: nothing is set, and no notice shown.
 *
 * NO READ DEPENDS ON THE TOKEN. Anyone can call this with any token. Whether
 * the host can sign in is the live read the portal page makes on every view;
 * beyond it, the token is resolved through the one cached read per conference.
 */
export async function openEarlyAccessLink(
  request: NextRequest,
  token: string,
): Promise<NextResponse> {
  if (isAuthHost(request.headers)) return notFound()
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) return notFound()
  if (!(await isWorkshopsEnabledForConference(conference))) return notFound()

  const tenant = await resolveTenantHost(request.headers)
  if (!tenant) {
    const mainHost = workshopMainHost(conference)
    const onMainHost =
      !mainHost ||
      normalizeDomain(mainHost) ===
        normalizeDomain(request.headers.get('host') ?? '')
    const mainPortal = onMainHost ? null : await workshopPortalUrl(conference)
    return mainPortal
      ? NextResponse.redirect(earlyAccessUrl(mainPortal, token), {
          status: 307,
          headers: SEALED,
        })
      : toPortal()
  }
  // The conference is read through a cache. Right after a host changes hands
  // it can differ from the one that claims the host now: then nothing is set.
  if (tenant.destination.conference._id !== conference._id) return toPortal()

  if (!(await resolveEarlyAccess(conference._id, token))) {
    return toPortal(WORKSHOP_EARLY_ACCESS_INVALID_QUERY)
  }
  const response = toPortal()
  const opening = conference.workshopRegistrationStart
    ? new Date(conference.workshopRegistrationStart)
    : null
  if (opening && opening.getTime() > Date.now()) {
    const cookie = earlyAccessCookie()
    response.cookies.set(cookie.name, token, {
      ...cookie.options,
      expires: opening,
    })
  }
  return response
}
