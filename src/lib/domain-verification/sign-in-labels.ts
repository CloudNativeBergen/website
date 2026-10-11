/**
 * The organizer's wording for a host's workshop sign-in standing, shared by
 * the domain card and system status. Client-safe.
 */

import type { WorkshopSignInStanding } from './sign-in-standing'

export interface WorkshopSignInLabel {
  status: 'ok' | 'warn' | 'error'
  label: string
  detail: string | null
}

export function workshopSignInLabel(
  standing: WorkshopSignInStanding,
): WorkshopSignInLabel {
  switch (standing.state) {
    case 'available':
      return { status: 'ok', label: 'available', detail: null }
    case 'unverified':
      return {
        status: 'warn',
        label: 'domain not verified',
        detail:
          'Attendees cannot sign in to workshops on this host until the domain is verified. For a domain of your own, publish the TXT record shown on the domain card in Settings, then press Check now. For a host the platform provided, contact the platform operator.',
      }
    case 'blocked':
      // Nothing the organizer can change: the domain is verified.
      return standing.by === 'auth-host'
        ? {
            status: 'error',
            label: 'not available on the sign-in host',
            detail:
              'This host is the platform’s own sign-in host (WORKSHOP_AUTH_ORIGIN), which serves no conference, so attendees cannot sign in to workshops on it. The domain is verified; contact the platform operator.',
          }
        : {
            status: 'error',
            label: 'switched off on every host',
            detail:
              'The platform’s sign-in host is not set up correctly (WORKSHOP_AUTH_ORIGIN), so attendees cannot sign in to workshops on any host. The domain is verified; contact the platform operator.',
          }
  }
}
