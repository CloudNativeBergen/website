/**
 * How a host's workshop sign-in standing (#1298) reads to an ORGANIZER: one
 * wording for the domain card and the system-status check. Client-safe.
 * Never shown to attendees, who only learn that sign-up is not available.
 */

import type { WorkshopSignInStanding } from './sign-in-standing'

// Scoped to THIS host: a secondary host that cannot sign in redirects to the
// main host's portal when that works, and only the first domain decides
// whether ticket emails carry the link.
const NOT_YET =
  'Until then workshop sign-up is not available on this host. If it is the conference’s first domain, ticket emails also go out without the portal link.'

export interface WorkshopSignInLabel {
  status: 'ok' | 'warn' | 'error' | 'off'
  label: string
  detail: string | null
}

export function workshopSignInLabel(
  standing: WorkshopSignInStanding,
): WorkshopSignInLabel {
  switch (standing.state) {
    case 'ready':
      return { status: 'ok', label: 'available', detail: null }
    case 'unverified':
      return {
        status: 'warn',
        label: 'domain not verified',
        detail: `Sign-in is set up once the domain is verified. ${NOT_YET}`,
      }
    case 'pending':
      return {
        status: 'warn',
        label: 'registration pending',
        detail: `The domain is verified and sign-in is being registered. This happens automatically, at the latest with the next daily check. ${NOT_YET}`,
      }
    case 'failed':
      return {
        status: 'error',
        label: 'registration failed',
        detail: `${standing.error.replace(/\.*$/, '')}. It is retried automatically with the next daily check. ${NOT_YET}`,
      }
    case 'blocked':
      return {
        status: 'error',
        label: 'switched off on every host',
        detail: `WORKOS_COOKIE_DOMAIN is set in the deployment, so workshop sign-in is refused on every host; the platform operator has to unset it. ${NOT_YET}`,
      }
    case 'not-offered':
      // A warning, not "off": workshops are on, and sign-up does not work on
      // this host.
      return {
        status: 'warn',
        label: 'not offered on this host',
        detail:
          'Workshop sign-in runs only on hosts the platform controls, such as a host the platform provided for this conference. Workshop sign-up is not available on this host.',
      }
  }
}
