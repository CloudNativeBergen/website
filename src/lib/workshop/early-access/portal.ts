import 'server-only'
import { resolveSignInHost } from '../central-sign-in/decision'
import { workshopMainHost } from '../sign-in'
import { WORKSHOP_PORTAL_PATH } from '../sign-in-paths'

/**
 * WHERE AN EARLY-ACCESS LINK OF THIS CONFERENCE MAY POINT (#1346): the portal
 * on the conference's main host, or `null`.
 *
 * `null` unless that host can sign people in AND IS STILL THIS CONFERENCE'S,
 * both read live. `conference` usually comes through a cache: when its main
 * domain has since changed hands, an address there would put this
 * conference's token on another tenant's host. EVERY ADDRESS THAT CARRIES A
 * TOKEN IS BUILT FROM THIS: the one an organizer is given, and the one a
 * secondary host forwards to.
 *
 * ONE LIVE RECORD READ, the one `workshopPortalUrl` makes.
 */
export async function earlyAccessPortalUrl(conference: {
  _id: string
  title?: string | null
  domains?: readonly string[] | null
}): Promise<string | null> {
  const host = workshopMainHost(conference)
  if (!host) return null
  const main = await resolveSignInHost(host)
  return main?.destination.conference._id === conference._id
    ? `${main.destination.origin}${WORKSHOP_PORTAL_PATH}`
    : null
}
